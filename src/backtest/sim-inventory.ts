import {
  DIRECTION_SOFT_CAP, DIRECTION_CRUSH_CAP, DIRECTION_HARD_CAP, CELL_CAP,
  getDirectionAdjustment, getCellPenalty as calcCellPenalty,
} from './sim-math';
import type { CellSide, DirectionStatus } from './types';

export class SimInventory {
  // slotMs → { up, down, center }
  private slotInventory = new Map<number, { up: number; down: number; center: number }>();
  // cellKey → liability
  private cellLiability = new Map<string, number>();

  getSlotInv(slotMs: number) {
    return this.slotInventory.get(slotMs) || { up: 0, down: 0, center: 0 };
  }

  getImbalance(slotMs: number): number {
    const inv = this.getSlotInv(slotMs);
    const total = inv.up + inv.down + 0.01;
    return inv.up / total;
  }

  getDirectionStatus(cellSide: CellSide, slotMs: number): DirectionStatus {
    if (cellSide === 'center') return 'normal';
    const inv = this.getSlotInv(slotMs);
    const liability = cellSide === 'up' ? inv.up : inv.down;
    if (liability >= DIRECTION_HARD_CAP) return 'blocked';
    if (liability >= DIRECTION_CRUSH_CAP) return 'crushed';
    if (liability >= DIRECTION_SOFT_CAP) return 'pressured';
    return 'normal';
  }

  getDirAdjustment(cellSide: CellSide, slotMs: number): number {
    const imbalance = this.getImbalance(slotMs);
    const status = this.getDirectionStatus(cellSide, slotMs);
    return getDirectionAdjustment(cellSide, imbalance, status);
  }

  getCellLiability(cellKey: string): number {
    return this.cellLiability.get(cellKey) || 0;
  }

  getCellPenalty(cellKey: string): number {
    return calcCellPenalty(this.getCellLiability(cellKey));
  }

  getTotalExposure(): number {
    let total = 0;
    for (const inv of this.slotInventory.values()) {
      total += inv.up + inv.down + inv.center;
    }
    return total;
  }

  getLiabilityUp(): number {
    let total = 0;
    for (const inv of this.slotInventory.values()) total += inv.up;
    return total;
  }

  getLiabilityDown(): number {
    let total = 0;
    for (const inv of this.slotInventory.values()) total += inv.down;
    return total;
  }

  addLiability(cellKey: string, slotMs: number, cellSide: CellSide, amount: number) {
    // Cell liability
    this.cellLiability.set(cellKey, (this.cellLiability.get(cellKey) || 0) + amount);

    // Slot inventory
    const inv = this.getSlotInv(slotMs);
    if (cellSide === 'up') inv.up += amount;
    else if (cellSide === 'down') inv.down += amount;
    else inv.center += amount;
    this.slotInventory.set(slotMs, inv);
  }

  releaseLiability(cellKey: string, slotMs: number, cellSide: CellSide, amount: number) {
    // Cell
    const current = this.cellLiability.get(cellKey) || 0;
    this.cellLiability.set(cellKey, Math.max(0, current - amount));

    // Slot
    const inv = this.getSlotInv(slotMs);
    if (cellSide === 'up') inv.up = Math.max(0, inv.up - amount);
    else if (cellSide === 'down') inv.down = Math.max(0, inv.down - amount);
    else inv.center = Math.max(0, inv.center - amount);
    this.slotInventory.set(slotMs, inv);
  }

  // Cleanup expired slots
  cleanupSlot(slotMs: number) {
    this.slotInventory.delete(slotMs);
    // Clean cell liabilities for this slot
    for (const key of this.cellLiability.keys()) {
      if (key.endsWith(`_${slotMs}`)) {
        this.cellLiability.delete(key);
      }
    }
  }
}
