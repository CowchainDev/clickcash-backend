import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const DIRECTION_SOFT_CAP = 500;
const DIRECTION_CRUSH_CAP = 1000;
const DIRECTION_HARD_CAP = 1500;
const CELL_CAP = 500;

const ADJUSTMENT_STRENGTH_NORMAL = 0.6;
const ADJUSTMENT_STRENGTH_PRESSURED = 0.9;

export type DirectionStatus = 'normal' | 'pressured' | 'crushed' | 'blocked';
export type CellSide = 'up' | 'down' | 'center';

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSlotInventory(slotTimestamp: Date) {
    const inv = await this.prisma.slotInventory.findUnique({
      where: { slotTimestamp },
    });
    return {
      liability_up: inv ? Number(inv.liabilityUp) : 0,
      liability_down: inv ? Number(inv.liabilityDown) : 0,
      liability_center: inv ? Number(inv.liabilityCenter) : 0,
    };
  }

  async getImbalance(slotTimestamp: Date): Promise<number> {
    const inv = await this.getSlotInventory(slotTimestamp);
    const total = inv.liability_up + inv.liability_down + 0.01;
    return inv.liability_up / total;
  }

  async getDirectionStatus(cellSide: CellSide, slotTimestamp: Date): Promise<DirectionStatus> {
    if (cellSide === 'center') return 'normal';

    const inv = await this.getSlotInventory(slotTimestamp);
    const liability = cellSide === 'up' ? inv.liability_up : inv.liability_down;

    if (liability >= DIRECTION_HARD_CAP) return 'blocked';
    if (liability >= DIRECTION_CRUSH_CAP) return 'crushed';
    if (liability >= DIRECTION_SOFT_CAP) return 'pressured';
    return 'normal';
  }

  getDirectionAdjustment(cellSide: CellSide, imbalance: number, dirStatus: DirectionStatus): number {
    if (cellSide === 'center') return 1.0;
    if (dirStatus === 'blocked') return 0;
    if (dirStatus === 'crushed') return 0.5;

    const deviation = imbalance - 0.5;
    const strength = dirStatus === 'pressured' ? ADJUSTMENT_STRENGTH_PRESSURED : ADJUSTMENT_STRENGTH_NORMAL;

    if (cellSide === 'up') {
      return Math.min(1.40, Math.max(0.50, 1 - deviation * strength));
    }
    if (cellSide === 'down') {
      return Math.min(1.40, Math.max(0.50, 1 + deviation * strength));
    }
    return 1.0;
  }

  async getCellPenalty(cellKey: string): Promise<number> {
    const cell = await this.prisma.cellLiability.findUnique({ where: { cellKey } });
    const liability = cell ? Number(cell.liability) : 0;
    const fillRatio = Math.min(liability / CELL_CAP, 1.0);
    return 1 - fillRatio * fillRatio;
  }

  async getCellLiability(cellKey: string): Promise<number> {
    const cell = await this.prisma.cellLiability.findUnique({ where: { cellKey } });
    return cell ? Number(cell.liability) : 0;
  }

  async addLiability(cellKey: string, slotTimestamp: Date, cellSide: CellSide, amount: number) {
    // Update cell liability
    await this.prisma.cellLiability.upsert({
      where: { cellKey },
      create: { cellKey, liability: amount },
      update: { liability: { increment: amount } },
    });

    // Update slot inventory
    const updateData: any = {};
    if (cellSide === 'up') updateData.liabilityUp = { increment: amount };
    if (cellSide === 'down') updateData.liabilityDown = { increment: amount };
    if (cellSide === 'center') updateData.liabilityCenter = { increment: amount };

    await this.prisma.slotInventory.upsert({
      where: { slotTimestamp },
      create: {
        slotTimestamp,
        liabilityUp: cellSide === 'up' ? amount : 0,
        liabilityDown: cellSide === 'down' ? amount : 0,
        liabilityCenter: cellSide === 'center' ? amount : 0,
      },
      update: updateData,
    });
  }

  async releaseLiability(cellKey: string, slotTimestamp: Date, cellSide: CellSide, amount: number) {
    // Release cell liability
    const cell = await this.prisma.cellLiability.findUnique({ where: { cellKey } });
    if (cell) {
      const newLiability = Math.max(0, Number(cell.liability) - amount);
      await this.prisma.cellLiability.update({
        where: { cellKey },
        data: { liability: newLiability },
      });
    }

    // Release slot inventory
    const inv = await this.prisma.slotInventory.findUnique({ where: { slotTimestamp } });
    if (inv) {
      const update: any = {};
      if (cellSide === 'up') update.liabilityUp = Math.max(0, Number(inv.liabilityUp) - amount);
      if (cellSide === 'down') update.liabilityDown = Math.max(0, Number(inv.liabilityDown) - amount);
      if (cellSide === 'center') update.liabilityCenter = Math.max(0, Number(inv.liabilityCenter) - amount);
      await this.prisma.slotInventory.update({ where: { slotTimestamp }, data: update });
    }
  }
}
