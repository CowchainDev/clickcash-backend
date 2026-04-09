import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PriceEngineService } from '../prices/price-engine.service';
import { MultiplierService, Cell } from './multiplier.service';
import { SlotsService } from './slots.service';

export interface GridCell {
  low: number;
  high: number;
  multipliers: { slotMs: number; x: number; blocked: boolean }[];
  isCurrent: boolean;
}

export interface GridUpdate {
  cells: GridCell[];
  slots: { ms: number; label: string; settling: boolean }[];
  emaPrice: number;
  cellSize: number;
  timestamp: number;
}

@Injectable()
export class GridService {
  constructor(
    private readonly redis: RedisService,
    private readonly priceEngine: PriceEngineService,
    private readonly multiplier: MultiplierService,
    private readonly slots: SlotsService,
  ) {}

  buildVisibleCells(centerPrice: number, cellSize: number, rowCount: number = 9): Cell[] {
    const cells: Cell[] = [];
    // Snap center to cell boundary
    const centerLow = Math.floor(centerPrice / cellSize) * cellSize;

    // Build rows above and below center
    const halfRows = Math.floor(rowCount / 2);
    for (let i = halfRows; i >= -halfRows; i--) {
      const low = centerLow + i * cellSize;
      cells.push({ low, high: low + cellSize });
    }

    return cells;
  }

  async buildGridUpdate(numSlots: number = 6): Promise<GridUpdate | null> {
    const emaPrice = this.priceEngine.currentEmaPrice;
    if (!emaPrice) return null;

    const cellSize = await this.redis.getCellSize();
    const now = Date.now();
    const slotTimes = this.slots.getUpcomingSlots(now, numSlots);
    const cells = this.buildVisibleCells(emaPrice, cellSize);

    const gridCells: GridCell[] = [];

    for (const cell of cells) {
      const isCurrent = emaPrice >= cell.low && emaPrice < cell.high;
      const multipliers: { slotMs: number; x: number; blocked: boolean }[] = [];

      for (const slotMs of slotTimes) {
        const result = await this.multiplier.calculateMultiplier(cell, slotMs, emaPrice);
        multipliers.push({
          slotMs,
          x: result.x,
          blocked: result.blocked,
        });
      }

      gridCells.push({
        low: cell.low,
        high: cell.high,
        multipliers,
        isCurrent,
      });
    }

    return {
      cells: gridCells,
      slots: slotTimes.map((ms) => ({
        ms,
        label: this.slots.getSlotLabel(ms, now),
        settling: this.slots.isSettling(ms, now),
      })),
      emaPrice,
      cellSize,
      timestamp: now,
    };
  }
}
