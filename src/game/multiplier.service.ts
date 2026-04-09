import { Injectable } from '@nestjs/common';
import { VolatilityService } from '../prices/volatility.service';
import { InventoryService, CellSide } from './inventory.service';

const MARGIN_M = 0.08;
const MARGIN_R_BASE = 0.05;
const MARGIN_R_VOL_SCALE = 0.10;
const MARGIN_R_VOL_MAX = 0.12;
const MARGIN_MAX_TOTAL = 0.35;

const MIN_MULTIPLIER = 1.1;
const MAX_MULTIPLIER = 50.0;
const CRUSH_MAX_MULTIPLIER = 2.0;

export interface Cell {
  low: number;
  high: number;
}

export interface MultiplierResult {
  x: number;
  blocked: boolean;
  reason?: string;
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

@Injectable()
export class MultiplierService {
  constructor(
    private readonly volatility: VolatilityService,
    private readonly inventory: InventoryService,
  ) {}

  calcProbability(cellLow: number, cellHigh: number, currentPrice: number, sigma: number): number {
    const pHigh = normalCDF((cellHigh - currentPrice) / sigma);
    const pLow = normalCDF((cellLow - currentPrice) / sigma);
    const p = pHigh - pLow;
    return Math.max(p, 0.002);
  }

  async calcTotalMargin(sigma10s: number): Promise<number> {
    const medianSigma = await this.volatility.getSigmaMedian24h();
    const volRatio = sigma10s / medianSigma;
    const rVolAdj = clamp((volRatio - 1) * MARGIN_R_VOL_SCALE, 0, MARGIN_R_VOL_MAX);
    return MARGIN_M + MARGIN_R_BASE + rVolAdj;
  }

  getProgressiveMarginAddon(cellCenter: number, currentPrice: number, sigma10s: number): number {
    const distance = Math.abs(cellCenter - currentPrice);
    const distInSigmas = distance / sigma10s;
    if (distInSigmas <= 1.0) return 0;
    if (distInSigmas <= 2.0) return 0.02;
    if (distInSigmas <= 3.0) return 0.05;
    return 0.10;
  }

  getCellSide(cell: Cell, emaPrice: number): CellSide {
    if (emaPrice >= cell.low && emaPrice < cell.high) return 'center';
    const cellCenter = (cell.low + cell.high) / 2;
    return cellCenter > emaPrice ? 'up' : 'down';
  }

  async calculateMultiplier(cell: Cell, slotMs: number, emaPrice: number): Promise<MultiplierResult> {
    const cellCenter = (cell.low + cell.high) / 2;
    const cellSide = this.getCellSide(cell, emaPrice);
    const slotTimestamp = new Date(slotMs);

    // Direction block check
    const dirStatus = await this.inventory.getDirectionStatus(cellSide, slotTimestamp);
    if (dirStatus === 'blocked') {
      return { x: 0, blocked: true, reason: 'Direction limit reached' };
    }

    // Horizon
    const horizonSec = Math.round((slotMs - Date.now()) / 1000);
    const sigmaKey = horizonSec <= 12 ? 10 : horizonSec <= 17 ? 15 : 20;

    // Probability
    const sigma = await this.volatility.getCurrentSigma(sigmaKey);
    const p = this.calcProbability(cell.low, cell.high, emaPrice, sigma);

    // Dynamic margin
    const sigma10s = await this.volatility.getCurrentSigma(10);
    const baseMargin = await this.calcTotalMargin(sigma10s);
    const progressiveAddon = this.getProgressiveMarginAddon(cellCenter, emaPrice, sigma10s);
    const totalMargin = Math.min(baseMargin + progressiveAddon, MARGIN_MAX_TOTAL);

    // Base multiplier
    const xBase = (1 - totalMargin) / p;

    // Cell penalty
    const cellKey = `${cell.low}_${slotMs}`;
    const cellPenalty = await this.inventory.getCellPenalty(cellKey);

    // Direction adjustment
    const imbalance = await this.inventory.getImbalance(slotTimestamp);
    const dirAdj = this.inventory.getDirectionAdjustment(cellSide, imbalance, dirStatus);

    // Combine
    let xActual = xBase * cellPenalty * dirAdj;

    // Crush cap
    if (dirStatus === 'crushed') {
      xActual = Math.min(xActual, CRUSH_MAX_MULTIPLIER);
    }

    // Global clamp + round
    xActual = clamp(xActual, MIN_MULTIPLIER, MAX_MULTIPLIER);
    xActual = Math.round(xActual * 10) / 10;

    return { x: xActual, blocked: false };
  }
}
