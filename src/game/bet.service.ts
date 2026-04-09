import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PriceEngineService } from '../prices/price-engine.service';
import { VolatilityService } from '../prices/volatility.service';
import { MultiplierService, Cell } from './multiplier.service';
import { InventoryService } from './inventory.service';
import { UserService } from './user.service';

const MIN_BET = 5;
const MAX_BET = 100;
const MIN_BET_INTERVAL = 2000;
const SESSION_LOSS_LIMIT = 500;
const CELL_CAP = 500;
const LAST_LOOK_DELAY = 180;
const LAST_LOOK_THRESHOLD = 0.3;

export interface PlaceBetDto {
  userId: string;
  cellLow: number;
  cellHigh: number;
  slotMs: number;
  stake: number;
}

export interface BetResult {
  success: boolean;
  reason?: string;
  bet?: any;
}

@Injectable()
export class BetService {
  private readonly logger = new Logger(BetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly priceEngine: PriceEngineService,
    private readonly volatility: VolatilityService,
    private readonly multiplierService: MultiplierService,
    private readonly inventory: InventoryService,
    private readonly userService: UserService,
  ) {
    // Settlement check every 500ms
    setInterval(() => this.checkSettlements(), 500);
  }

  async placeBet(dto: PlaceBetDto): Promise<BetResult> {
    const { userId, cellLow, cellHigh, slotMs, stake } = dto;
    const cell: Cell = { low: cellLow, high: cellHigh };
    const emaPrice = this.priceEngine.currentEmaPrice;

    if (!emaPrice) return { success: false, reason: 'Price feed unavailable' };

    // Check kill switch
    if (await this.redis.isBettingPaused()) {
      return { success: false, reason: 'High volatility — betting paused' };
    }

    // Calculate multiplier at click time
    const result = await this.multiplierService.calculateMultiplier(cell, slotMs, emaPrice);
    if (result.blocked) return { success: false, reason: 'Direction locked' };

    const multiplier = result.x;
    const priceAtClick = emaPrice;

    // Validate
    const validation = await this.validateBet(userId, stake, cell, slotMs, multiplier);
    if (!validation.valid) return { success: false, reason: validation.reason };

    // ── LAST LOOK: 180ms pause ──
    await new Promise((resolve) => setTimeout(resolve, LAST_LOOK_DELAY));

    // Check price movement
    const currentEma = this.priceEngine.currentEmaPrice;
    if (!currentEma) return { success: false, reason: 'Price feed lost' };

    const priceDelta = Math.abs(currentEma - priceAtClick);
    const sigma10s = await this.volatility.getCurrentSigma(10);
    if (priceDelta > sigma10s * LAST_LOOK_THRESHOLD) {
      return { success: false, reason: 'Price moved — odds updated, please retry' };
    }

    // Re-validate after delay
    const revalidation = await this.validateBet(userId, stake, cell, slotMs, multiplier);
    if (!revalidation.valid) return { success: false, reason: revalidation.reason };

    // ── COMMIT BET ──
    return this.commitBet(userId, cell, slotMs, multiplier, stake, currentEma);
  }

  private async validateBet(
    userId: string,
    stake: number,
    cell: Cell,
    slotMs: number,
    multiplier: number,
  ): Promise<{ valid: boolean; reason?: string }> {
    // Amount range
    if (stake < MIN_BET || stake > MAX_BET) {
      return { valid: false, reason: `Bet must be $${MIN_BET}–$${MAX_BET}` };
    }

    // Balance
    const balance = await this.userService.getBalance(userId);
    if (stake > balance) {
      return { valid: false, reason: 'Insufficient balance' };
    }

    // Session loss limit
    const sessionLoss = await this.userService.getSessionLoss(userId);
    if (sessionLoss >= SESSION_LOSS_LIMIT) {
      return { valid: false, reason: 'Session limit reached. Take a break!' };
    }

    // Bet cooldown
    const lastBet = await this.userService.getLastBetTime(userId);
    if (Date.now() - lastBet < MIN_BET_INTERVAL) {
      return { valid: false, reason: 'Wait 2 seconds between bets' };
    }

    // Cell capacity
    const cellKey = `${cell.low}_${slotMs}`;
    const currentLiability = await this.inventory.getCellLiability(cellKey);
    const newLiability = stake * multiplier;
    if (currentLiability + newLiability > CELL_CAP) {
      const maxBet = Math.floor((CELL_CAP - currentLiability) / multiplier);
      if (maxBet < MIN_BET) return { valid: false, reason: 'Cell is full' };
      return { valid: false, reason: `Max bet for this cell: $${maxBet}` };
    }

    // Direction block
    const cellSide = this.multiplierService.getCellSide(cell, this.priceEngine.currentEmaPrice!);
    const dirStatus = await this.inventory.getDirectionStatus(cellSide, new Date(slotMs));
    if (dirStatus === 'blocked') {
      return { valid: false, reason: 'This direction is temporarily locked' };
    }

    // Slot validity (>3s remaining)
    if (slotMs - Date.now() < 3000) {
      return { valid: false, reason: 'Slot is settling' };
    }

    return { valid: true };
  }

  private async commitBet(
    userId: string,
    cell: Cell,
    slotMs: number,
    multiplier: number,
    stake: number,
    emaPrice: number,
  ): Promise<BetResult> {
    const cellSide = this.multiplierService.getCellSide(cell, emaPrice);
    const potentialPayout = stake * multiplier;
    const cellKey = `${cell.low}_${slotMs}`;
    const slotTimestamp = new Date(slotMs);

    // Deduct balance
    const deducted = await this.userService.deductBalance(userId, stake);
    if (!deducted) return { success: false, reason: 'Insufficient balance' };

    // Create bet in DB
    const bet = await this.prisma.bet.create({
      data: {
        userId,
        cellLow: cell.low,
        cellHigh: cell.high,
        cellSide,
        slotTimestamp,
        stake,
        multiplier,
        potentialPayout,
        placedPrice: emaPrice,
        status: 'ACTIVE',
      },
    });

    // Update inventory
    await this.inventory.addLiability(cellKey, slotTimestamp, cellSide, potentialPayout);

    this.logger.log(`Bet placed: ${bet.id} | ${cell.low}-${cell.high} | ${multiplier}x | $${stake} → $${potentialPayout}`);

    return { success: true, bet };
  }

  async checkSettlements() {
    const now = new Date();

    const toSettle = await this.prisma.bet.findMany({
      where: {
        status: 'ACTIVE',
        slotTimestamp: { lte: now },
      },
    });

    if (toSettle.length === 0) return;

    const emaPrice = this.priceEngine.currentEmaPrice;
    if (!emaPrice) return;

    for (const bet of toSettle) {
      const won = emaPrice >= Number(bet.cellLow) && emaPrice < Number(bet.cellHigh);
      const status = won ? 'WON' : 'LOST';

      // Update bet
      await this.prisma.bet.update({
        where: { id: bet.id },
        data: {
          status,
          settlementPrice: emaPrice,
          settledAt: now,
        },
      });

      // Credit or track loss
      if (won) {
        await this.userService.creditBalance(bet.userId, Number(bet.potentialPayout));
        this.logger.log(`WIN: ${bet.id} | +$${Number(bet.potentialPayout) - Number(bet.stake)}`);
      } else {
        await this.userService.addSessionLoss(bet.userId, Number(bet.stake));
        this.logger.log(`LOSS: ${bet.id} | -$${Number(bet.stake)}`);
      }

      // Release liabilities
      const cellKey = `${Number(bet.cellLow)}_${bet.slotTimestamp.getTime()}`;
      await this.inventory.releaseLiability(
        cellKey,
        bet.slotTimestamp,
        bet.cellSide as any,
        Number(bet.potentialPayout),
      );
    }
  }
}
