/**
 * Pure math functions extracted from production MultiplierService.
 * No dependencies — just math.
 */

// ── Constants (identical to production) ──
export const EMA_TAU = 0.5;
export const MARGIN_M = 0.08;
export const MARGIN_R_BASE = 0.05;
export const MARGIN_R_VOL_SCALE = 0.10;
export const MARGIN_R_VOL_MAX = 0.12;
export const MARGIN_MAX_TOTAL = 0.35;
export const MIN_MULTIPLIER = 1.1;
export const MAX_MULTIPLIER = 50.0;
export const CRUSH_MAX_MULTIPLIER = 2.0;
export const CELL_CAP = 500;
export const DIRECTION_SOFT_CAP = 500;
export const DIRECTION_CRUSH_CAP = 1000;
export const DIRECTION_HARD_CAP = 1500;
export const ADJUSTMENT_STRENGTH_NORMAL = 0.6;
export const ADJUSTMENT_STRENGTH_PRESSURED = 0.9;

export const SIGMA_DEFAULTS: Record<number, number> = { 10: 11, 15: 14, 20: 16 };
export const SIGMA_FLOOR: Record<number, number> = { 10: 6, 15: 8, 20: 10 };
export const CELL_SIZE_K = 0.8;
export const MIN_CELL_SIZE = 5;
export const MAX_CELL_SIZE = 50;
export const NICE_STEPS = [5, 10, 15, 20, 25, 50];

export const SLOT_INTERVAL = 10000;
export const MIN_TIME_TO_EXPIRY = 10000;

// ── EMA ──
export function computeEMA(rawPrice: number, prevEma: number, deltaSec: number): number {
  const alpha = 1 - Math.exp(-deltaSec / EMA_TAU);
  return alpha * rawPrice + (1 - alpha) * prevEma;
}

// ── Normal CDF (Abramowitz & Stegun approximation) ──
export function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

// ── Probability that price lands in [cellLow, cellHigh) ──
export function calcProbability(cellLow: number, cellHigh: number, currentPrice: number, sigma: number): number {
  const pHigh = normalCDF((cellHigh - currentPrice) / sigma);
  const pLow = normalCDF((cellLow - currentPrice) / sigma);
  return Math.max(pHigh - pLow, 0.002);
}

// ── Total margin ──
export function calcTotalMargin(sigma10s: number, sigmaMedian24h: number): number {
  const volRatio = sigma10s / sigmaMedian24h;
  const rVolAdj = clamp((volRatio - 1) * MARGIN_R_VOL_SCALE, 0, MARGIN_R_VOL_MAX);
  return MARGIN_M + MARGIN_R_BASE + rVolAdj;
}

// ── Progressive margin addon ──
export function getProgressiveMarginAddon(cellCenter: number, currentPrice: number, sigma10s: number): number {
  const distInSigmas = Math.abs(cellCenter - currentPrice) / sigma10s;
  if (distInSigmas <= 1.0) return 0;
  if (distInSigmas <= 2.0) return 0.02;
  if (distInSigmas <= 3.0) return 0.05;
  return 0.10;
}

// ── Cell penalty (quadratic) ──
export function getCellPenalty(cellLiability: number): number {
  const fillRatio = Math.min(cellLiability / CELL_CAP, 1.0);
  return 1 - fillRatio * fillRatio;
}

// ── Direction adjustment ──
export function getDirectionAdjustment(
  cellSide: 'up' | 'down' | 'center',
  imbalance: number,
  dirStatus: string,
): number {
  if (cellSide === 'center') return 1.0;
  if (dirStatus === 'blocked') return 0;
  if (dirStatus === 'crushed') return 0.5;

  const deviation = imbalance - 0.5;
  const strength = dirStatus === 'pressured' ? ADJUSTMENT_STRENGTH_PRESSURED : ADJUSTMENT_STRENGTH_NORMAL;

  if (cellSide === 'up') return clamp(1 - deviation * strength, 0.50, 1.40);
  if (cellSide === 'down') return clamp(1 + deviation * strength, 0.50, 1.40);
  return 1.0;
}

// ── Cell size from volatility ──
export function calcCellSize(sigma10s: number): number {
  const raw = sigma10s * CELL_SIZE_K;
  let best = NICE_STEPS[0];
  let bestDist = Infinity;
  for (const s of NICE_STEPS) {
    if (s < MIN_CELL_SIZE || s > MAX_CELL_SIZE) continue;
    const dist = Math.abs(s - raw);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return best;
}

// ── Build visible cells ──
export function buildVisibleCells(centerPrice: number, cellSize: number, rowCount = 9): { low: number; high: number }[] {
  const cells: { low: number; high: number }[] = [];
  const centerLow = Math.floor(centerPrice / cellSize) * cellSize;
  const halfRows = Math.floor(rowCount / 2);
  for (let i = halfRows; i >= -halfRows; i--) {
    const low = centerLow + i * cellSize;
    cells.push({ low, high: low + cellSize });
  }
  return cells;
}

// ── Upcoming slots ──
export function getUpcomingSlots(nowMs: number, count: number): number[] {
  const slots: number[] = [];
  let t = Math.ceil(nowMs / SLOT_INTERVAL) * SLOT_INTERVAL;
  while (slots.length < count) {
    if (t - nowMs >= MIN_TIME_TO_EXPIRY) slots.push(t);
    t += SLOT_INTERVAL;
  }
  return slots;
}

// ── Cell side ──
export function getCellSide(cell: { low: number; high: number }, emaPrice: number): 'up' | 'down' | 'center' {
  if (emaPrice >= cell.low && emaPrice < cell.high) return 'center';
  const center = (cell.low + cell.high) / 2;
  return center > emaPrice ? 'up' : 'down';
}

// ── Utility ──
export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
