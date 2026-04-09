import { SimVolatility } from './sim-volatility';
import { SimInventory } from './sim-inventory';
import { SimUser, createUsers } from './sim-user';
import {
  calcProbability, calcTotalMargin, getProgressiveMarginAddon,
  getCellSide, buildVisibleCells, getUpcomingSlots, clamp,
  CELL_CAP, MIN_MULTIPLIER, MAX_MULTIPLIER, CRUSH_MAX_MULTIPLIER, MARGIN_MAX_TOTAL,
} from './sim-math';
import type { SimTick, SimBet, BacktestTick, BacktestConfig, MultiplierResult, ActivityEvent } from './types';

export class SimulationEngine {
  private volatility = new SimVolatility();
  private inventory = new SimInventory();
  private users: SimUser[] = [];
  private activeBets: SimBet[] = [];
  private settledBets: SimBet[] = [];
  private activityLog: ActivityEvent[] = [];
  private activityCounter = 0;

  // Metrics
  private platformPnl = 0;
  private totalBets = 0;
  private totalWon = 0;
  private totalLost = 0;
  private totalStaked = 0;
  private totalPaidOut = 0;
  private peakExposure = 0;
  private multiplierSum = 0;

  // Clock
  private simTime = 0;
  private tickIndex = 0;
  private ticks: SimTick[] = [];
  private running = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastEmitTime = 0;
  private lastPersistTime = 0;
  private lastSigmaRecord = 0;

  private onTick: ((tick: BacktestTick) => void) | null = null;
  private onActivity: ((events: ActivityEvent[]) => void) | null = null;
  private onComplete: (() => void) | null = null;
  private pendingActivities: ActivityEvent[] = [];

  constructor(
    private config: BacktestConfig,
  ) {}

  init(ticks: SimTick[]) {
    this.ticks = ticks;
    this.simTime = ticks.length > 0 ? ticks[0].timestamp : this.config.startTime;
    this.tickIndex = 0;

    this.users = createUsers(this.config.numUsers, this.config.strategyMix);
  }

  start(onTick: (tick: BacktestTick) => void, onComplete: () => void, onActivity?: (events: ActivityEvent[]) => void) {
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.onActivity = onActivity || null;
    this.running = true;
    this.lastEmitTime = Date.now();

    // Run at ~60fps real-time
    this.interval = setInterval(() => this.step(), 16);
  }

  stop() {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    // Settle remaining bets at final price
    this.settleAll();
  }

  getMetrics(): BacktestTick {
    const emaPrice = this.ticks[Math.min(this.tickIndex, this.ticks.length - 1)]?.emaPrice ?? 0;
    const exposure = this.inventory.getTotalExposure();
    const activeUsers = this.users.filter(u => u.state.balance >= 5 && u.state.sessionLoss < 500).length;
    const avgBalance = this.users.reduce((s, u) => s + u.state.balance, 0) / this.users.length;

    return {
      simTimeMs: this.simTime,
      emaPrice,
      platformPnl: this.platformPnl,
      exposure,
      activeBets: this.activeBets.length,
      totalBets: this.totalBets,
      totalWon: this.totalWon,
      totalLost: this.totalLost,
      winRate: this.totalBets > 0 ? this.totalWon / this.totalBets : 0,
      avgMultiplier: this.totalBets > 0 ? this.multiplierSum / this.totalBets : 0,
      liabilityUp: this.inventory.getLiabilityUp(),
      liabilityDown: this.inventory.getLiabilityDown(),
      totalStaked: this.totalStaked,
      totalPaidOut: this.totalPaidOut,
      usersActive: activeUsers,
      avgUserBalance: avgBalance,
      killSwitchActive: this.volatility.isBettingPausedAt(this.simTime),
    };
  }

  private step() {
    if (!this.running || this.tickIndex >= this.ticks.length) {
      this.stop();
      this.onComplete?.();
      return;
    }

    const realNow = Date.now();
    const advanceMs = 16 * this.config.speedMultiplier; // 16ms real × speed
    const targetSimTime = this.simTime + advanceMs;

    // 1. PRICE FEED — replay ticks up to targetSimTime
    while (this.tickIndex < this.ticks.length && this.ticks[this.tickIndex].timestamp <= targetSimTime) {
      const tick = this.ticks[this.tickIndex];
      this.volatility.pushPrice(tick.emaPrice, tick.timestamp);
      this.tickIndex++;
    }
    this.simTime = targetSimTime;

    // Record sigma periodically
    if (this.simTime - this.lastSigmaRecord >= 30000) {
      this.volatility.recordSigmaForHistory();
      this.lastSigmaRecord = this.simTime;
    }

    // 2. SETTLEMENT
    this.settleExpired();

    // 3. USER BETS
    this.processUserBets();

    // 3b. USER CHURN — replace quit users with new ones (organic traffic)
    this.handleChurn();

    // Track peak exposure
    const exposure = this.inventory.getTotalExposure();
    if (exposure > this.peakExposure) this.peakExposure = exposure;

    // 4. EMIT every ~500ms real-time
    if (realNow - this.lastEmitTime >= 500) {
      this.onTick?.(this.getMetrics());
      // Flush activity log (send last 50 events max)
      if (this.pendingActivities.length > 0 && this.onActivity) {
        this.onActivity(this.pendingActivities.slice(-50));
        this.pendingActivities = [];
      }
      this.lastEmitTime = realNow;
    }
  }

  private settleExpired() {
    const currentPrice = this.getCurrentEma();
    if (currentPrice === 0) return;

    const toSettle = this.activeBets.filter(b => b.slotMs <= this.simTime);

    for (const bet of toSettle) {
      const won = currentPrice >= bet.cell.low && currentPrice < bet.cell.high;
      bet.status = won ? 'won' : 'lost';
      bet.settlementPrice = currentPrice;
      bet.settledAt = this.simTime;

      const user = this.users.find(u => u.state.id === bet.userId);
      const profit = won ? -(bet.potentialPayout - bet.stake) : bet.stake;

      if (won) {
        user?.onWin(bet.potentialPayout, this.simTime);
        this.platformPnl -= (bet.potentialPayout - bet.stake);
        this.totalPaidOut += bet.potentialPayout;
        this.totalWon++;
        this.pushActivity('bet_won', bet.userId, user?.state.strategyName || '?',
          `Won $${(bet.potentialPayout - bet.stake).toFixed(0)} on [${bet.cell.low}-${bet.cell.high}] at ${bet.multiplier}x`,
          bet.potentialPayout, profit);
      } else {
        user?.onLoss(bet.stake, this.simTime);
        this.platformPnl += bet.stake;
        this.totalLost++;
        this.pushActivity('bet_lost', bet.userId, user?.state.strategyName || '?',
          `Lost $${bet.stake} on [${bet.cell.low}-${bet.cell.high}] — price was $${currentPrice.toFixed(0)}`,
          bet.stake, profit);
      }

      // Release liability
      const cellKey = `${bet.cell.low}_${bet.slotMs}`;
      this.inventory.releaseLiability(cellKey, bet.slotMs, bet.cellSide, bet.potentialPayout);
    }

    // Move settled bets out of active
    this.activeBets = this.activeBets.filter(b => b.status === 'active');
    this.settledBets.push(...toSettle);
  }

  private processUserBets() {
    const emaPrice = this.getCurrentEma();
    if (emaPrice === 0) return;
    if (this.volatility.isBettingPausedAt(this.simTime)) return;

    const cellSize = this.volatility.cellSize;
    const cells = buildVisibleCells(emaPrice, cellSize, 9);
    const slots = getUpcomingSlots(this.simTime, 6);
    const recentTrend = this.volatility.getRecentTrend();

    for (const user of this.users) {
      if (!user.canBet(this.simTime)) continue;

      // Pick cell
      const cell = user.strategy.pickCell(cells, emaPrice, cellSize, recentTrend);
      if (!cell) continue;

      // Pick slot (one of the first 3)
      const slotIdx = Math.min(Math.floor(Math.random() * 3), slots.length - 1);
      const slotMs = slots[slotIdx];
      if (!slotMs || slotMs - this.simTime < 3000) continue;

      // Calculate multiplier
      const result = this.calculateMultiplier(cell, slotMs, emaPrice);
      if (result.blocked) continue;

      // Pick stake — adjusted by user's emotional state
      const baseStake = user.strategy.pickStake(user.state.balance, result.x);
      const stake = Math.round(Math.max(5, Math.min(100, baseStake * user.getStakeMultiplier())) / 5) * 5;
      if (stake < 5 || stake > user.state.balance) continue;

      // Check cell capacity
      const cellKey = `${cell.low}_${slotMs}`;
      if (this.inventory.getCellLiability(cellKey) + stake * result.x > CELL_CAP) continue;

      // Commit bet
      const cellSide = getCellSide(cell, emaPrice);
      const potentialPayout = stake * result.x;

      user.deductStake(stake, this.simTime);
      this.inventory.addLiability(cellKey, slotMs, cellSide, potentialPayout);

      this.activeBets.push({
        id: `${this.totalBets}`,
        userId: user.state.id,
        cell,
        cellSide,
        slotMs,
        stake,
        multiplier: result.x,
        potentialPayout,
        placedPrice: emaPrice,
        placedAt: this.simTime,
        status: 'active',
      });

      this.totalBets++;
      this.totalStaked += stake;
      this.multiplierSum += result.x;

      this.pushActivity('bet_placed', user.state.id, user.state.strategyName,
        `Bet $${stake} on [${cell.low}-${cell.high}] at ${result.x}x → potential $${potentialPayout.toFixed(0)}`,
        stake);
    }
  }

  private pushActivity(type: ActivityEvent['type'], userId: string, strategy: string, details: string, amount?: number, pnlImpact?: number) {
    this.pendingActivities.push({
      id: this.activityCounter++,
      simTimeMs: this.simTime,
      type,
      userId,
      strategy,
      details,
      amount,
      pnlImpact,
    });
  }

  private handleChurn() {
    // Count quit/broke users
    const quitUsers = this.users.filter(u => !u.isActive());
    if (quitUsers.length === 0) return;

    // Log quit events
    for (const user of quitUsers) {
      if (user.state.betCount > 0) { // only log if they actually played
        const reason = user.state.balance < 5 ? 'Ran out of funds' : `Quit after losing $${user.state.sessionLoss.toFixed(0)}`;
        this.pushActivity('user_quit', user.state.id, user.state.strategyName,
          `${reason} — played ${user.state.betCount} bets, won ${user.state.winCount}`,
          user.state.sessionLoss);
      }
    }

    // Replace ~50% of quit users with new arrivals (organic traffic)
    const replacements = Math.floor(quitUsers.length * 0.5);
    const strategies = ['Casual', 'Gambler', 'Analyst', 'Whale', 'Martingale'];
    const weights = [0.40, 0.25, 0.20, 0.10, 0.05];

    for (let i = 0; i < replacements; i++) {
      let r = Math.random();
      let strategyName = 'Casual';
      for (let j = 0; j < weights.length; j++) {
        r -= weights[j];
        if (r <= 0) { strategyName = strategies[j]; break; }
      }

      const idx = this.users.findIndex(u => !u.isActive());
      if (idx >= 0) {
        const newUser = new SimUser(strategyName);
        this.users[idx] = newUser;
        this.pushActivity('user_joined', newUser.state.id, strategyName,
          `New ${strategyName} user joined with $${newUser.state.balance.toFixed(0)}`);
      }
    }
  }

  private calculateMultiplier(cell: { low: number; high: number }, slotMs: number, emaPrice: number): MultiplierResult {
    const cellCenter = (cell.low + cell.high) / 2;
    const cellSide = getCellSide(cell, emaPrice);

    // Direction check
    const dirStatus = this.inventory.getDirectionStatus(cellSide, slotMs);
    if (dirStatus === 'blocked') return { x: 0, blocked: true };

    // Horizon
    const horizonSec = Math.round((slotMs - this.simTime) / 1000);
    const sigmaKey = horizonSec <= 12 ? 10 : horizonSec <= 17 ? 15 : 20;
    const sigma = this.volatility.getSigma(sigmaKey);

    // Probability
    const p = calcProbability(cell.low, cell.high, emaPrice, sigma);

    // Margin
    const sigma10s = this.volatility.getSigma(10);
    const sigmaMedian = this.volatility.getSigmaMedian24h();
    const baseMargin = calcTotalMargin(sigma10s, sigmaMedian);
    const progressiveAddon = getProgressiveMarginAddon(cellCenter, emaPrice, sigma10s);
    const totalMargin = Math.min(baseMargin + progressiveAddon, MARGIN_MAX_TOTAL);

    // Base multiplier
    const xBase = (1 - totalMargin) / p;

    // Adjustments
    const cellKey = `${cell.low}_${slotMs}`;
    const cellPenalty = this.inventory.getCellPenalty(cellKey);
    const dirAdj = this.inventory.getDirAdjustment(cellSide, slotMs);

    let x = xBase * cellPenalty * dirAdj;
    if (dirStatus === 'crushed') x = Math.min(x, CRUSH_MAX_MULTIPLIER);
    x = clamp(x, MIN_MULTIPLIER, MAX_MULTIPLIER);
    x = Math.round(x * 10) / 10;

    return { x, blocked: false };
  }

  private getCurrentEma(): number {
    if (this.tickIndex === 0) return 0;
    return this.ticks[Math.min(this.tickIndex - 1, this.ticks.length - 1)].emaPrice;
  }

  private settleAll() {
    // Force settle all active bets at current price
    const price = this.getCurrentEma();
    for (const bet of this.activeBets) {
      const won = price >= bet.cell.low && price < bet.cell.high;
      bet.status = won ? 'won' : 'lost';
      bet.settlementPrice = price;
      bet.settledAt = this.simTime;

      const user = this.users.find(u => u.state.id === bet.userId);
      if (won) {
        user?.onWin(bet.potentialPayout, this.simTime);
        this.platformPnl -= (bet.potentialPayout - bet.stake);
        this.totalPaidOut += bet.potentialPayout;
        this.totalWon++;
      } else {
        user?.onLoss(bet.stake, this.simTime);
        this.platformPnl += bet.stake;
        this.totalLost++;
      }
    }
    this.activeBets = [];
  }
}
