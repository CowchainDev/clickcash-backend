import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PriceEngineService } from './price-engine.service';
import { PrismaService } from '../database/prisma.service';
import { Subscription } from 'rxjs';

const SIGMA_DEFAULTS: Record<number, number> = { 10: 11, 15: 14, 20: 16 };
const SIGMA_FLOOR: Record<number, number> = { 10: 6, 15: 8, 20: 10 };
const CELL_SIZE_K = 0.8;
const MIN_CELL_SIZE = 5;
const MAX_CELL_SIZE = 50;
const NICE_STEPS = [5, 10, 15, 20, 25, 50];

// Kill switch
const KILL_SWITCH_MULTIPLIER = 3;
const KILL_SWITCH_DURATION = 20000; // 20s pause

@Injectable()
export class VolatilityService implements OnModuleInit {
  private readonly logger = new Logger(VolatilityService.name);
  private sub: Subscription | null = null;
  private recentMoves: { move: number; t: number }[] = [];
  private prevEma: number | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly priceEngine: PriceEngineService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // Update volatility on each EMA tick
    this.sub = this.priceEngine.emaTick$.subscribe(({ price, timestamp }) => {
      this.updateVolatility(price, timestamp);
      this.checkKillSwitch(price, timestamp);
      this.prevEma = price;
    });

    // Record sigma every 30s for 24h history
    setInterval(async () => {
      const sigma = await this.getCurrentSigma(10);
      await this.prisma.sigmaHistory.create({ data: { sigma10s: sigma } });
      // Cleanup entries older than 24h
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await this.prisma.sigmaHistory.deleteMany({ where: { recordedAt: { lt: cutoff } } });
    }, 30000);

    // Update cell size every 30s
    setInterval(async () => {
      const sigma10s = await this.getCurrentSigma(10);
      const newSize = this.calcCellSize(sigma10s);
      await this.redis.setCellSize(newSize);
    }, 30000);
  }

  private async updateVolatility(price: number, timestamp: number) {
    // Compute realized sigma for each horizon
    for (const horizon of [10, 15, 20]) {
      const sigma = await this.computeRealizedSigma(horizon);
      const floor = SIGMA_FLOOR[horizon];
      const final = sigma !== null ? Math.max(sigma, floor) : SIGMA_DEFAULTS[horizon];
      await this.redis.setSigma(horizon, final);
    }
  }

  async computeRealizedSigma(horizonSec: number): Promise<number | null> {
    const horizonMs = horizonSec * 1000;
    const buffer = await this.redis.getEmaBuffer(Date.now() - 5 * 60 * 1000);

    if (buffer.length < 30) return null;

    const deltas: number[] = [];
    for (let i = 0; i < buffer.length; i++) {
      const targetTime = buffer[i].t + horizonMs;
      const future = buffer.find((x) => Math.abs(x.t - targetTime) < 1000);
      if (future) {
        deltas.push(future.p - buffer[i].p);
      }
    }

    if (deltas.length < 30) return null;

    const variance = deltas.reduce((sum, d) => sum + d * d, 0) / deltas.length;
    return Math.sqrt(variance);
  }

  async getCurrentSigma(horizonSec: number): Promise<number> {
    const cached = await this.redis.getSigma(horizonSec);
    return cached ?? SIGMA_DEFAULTS[horizonSec];
  }

  async getSigmaMedian24h(): Promise<number> {
    const entries = await this.prisma.sigmaHistory.findMany({
      orderBy: { recordedAt: 'desc' },
      take: 2880,
      select: { sigma10s: true },
    });

    if (entries.length < 10) return SIGMA_DEFAULTS[10];

    const sorted = entries.map((e) => e.sigma10s).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  calcCellSize(sigma10s: number): number {
    const raw = sigma10s * CELL_SIZE_K;
    let best = NICE_STEPS[0];
    let bestDist = Infinity;
    for (const s of NICE_STEPS) {
      if (s < MIN_CELL_SIZE || s > MAX_CELL_SIZE) continue;
      const dist = Math.abs(s - raw);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  }

  private checkKillSwitch(newEma: number, tickMs: number) {
    if (this.prevEma === null) return;

    const move = Math.abs(newEma - this.prevEma);
    this.recentMoves.push({ move, t: tickMs });

    // Keep last 5 seconds
    while (this.recentMoves.length > 0 && tickMs - this.recentMoves[0].t > 5000) {
      this.recentMoves.shift();
    }

    if (this.recentMoves.length < 5) return;

    const avgMove = this.recentMoves.reduce((s, m) => s + m.move, 0) / this.recentMoves.length;

    // Get current sigma synchronously from cache (best effort)
    this.getCurrentSigma(10).then((sigma10s) => {
      const normalMovePerTick = sigma10s / 20;
      if (avgMove > normalMovePerTick * KILL_SWITCH_MULTIPLIER) {
        this.redis.setBettingPaused(tickMs + KILL_SWITCH_DURATION);
        this.logger.warn('Kill switch activated — betting paused for 20s');
      }
    });
  }
}
