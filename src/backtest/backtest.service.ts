import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PriceReplayService } from './price-replay.service';
import { SimulationEngine } from './simulation-engine';
import type { BacktestConfig, BacktestTick, ActivityEvent } from './types';

@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);
  private currentEngine: SimulationEngine | null = null;
  private currentRunId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceReplay: PriceReplayService,
  ) {}

  async startRun(
    config: BacktestConfig,
    onTick: (tick: BacktestTick) => void,
    onActivity?: (events: ActivityEvent[]) => void,
  ): Promise<string> {
    if (this.currentEngine) {
      throw new Error('A backtest is already running. Stop it first.');
    }

    // Create DB record
    const run = await this.prisma.backtestRun.create({
      data: {
        startTime: new Date(config.startTime),
        endTime: new Date(config.endTime),
        numUsers: config.numUsers,
        speedMultiplier: config.speedMultiplier,
        status: 'RUNNING',
      },
    });
    this.currentRunId = run.id;

    this.logger.log(`Starting backtest ${run.id}: ${config.numUsers} users, ${config.speedMultiplier}x speed`);
    this.logger.log(`Period: ${new Date(config.startTime).toISOString()} → ${new Date(config.endTime).toISOString()}`);

    // Fetch historical data
    const klines = await this.priceReplay.fetchKlines(config.startTime, config.endTime);
    const ticks = this.priceReplay.interpolateToTicks(klines);

    // Create engine
    this.currentEngine = new SimulationEngine(config);
    this.currentEngine.init(ticks);

    let snapshotCounter = 0;

    // Start with tick + activity callbacks
    this.currentEngine.start(
      async (tick) => {
        onTick(tick);

        // Persist snapshot every 10 ticks (~5s real-time)
        snapshotCounter++;
        if (snapshotCounter % 10 === 0) {
          try {
            await this.prisma.backtestSnapshot.create({
              data: {
                runId: run.id,
                simTimeMs: BigInt(Math.floor(tick.simTimeMs)),
                emaPrice: tick.emaPrice,
                platformPnl: tick.platformPnl,
                exposure: tick.exposure,
                activeBets: tick.activeBets,
                totalBets: tick.totalBets,
                winRate: tick.winRate,
                avgMultiplier: tick.avgMultiplier,
                liabilityUp: tick.liabilityUp,
                liabilityDown: tick.liabilityDown,
              },
            });
          } catch {
            // Non-critical — don't crash the sim
          }
        }
      },
      async () => {
        // On complete (second arg)
        const finalMetrics = this.currentEngine!.getMetrics();
        await this.prisma.backtestRun.update({
          where: { id: run.id },
          data: {
            status: 'COMPLETED',
            totalBets: finalMetrics.totalBets,
            totalWon: finalMetrics.totalWon,
            totalLost: finalMetrics.totalLost,
            totalStaked: finalMetrics.totalStaked,
            totalPaidOut: finalMetrics.totalPaidOut,
            platformPnl: finalMetrics.platformPnl,
            peakExposure: finalMetrics.exposure,
            completedAt: new Date(),
          },
        });
        this.logger.log(`Backtest ${run.id} completed: P&L = $${finalMetrics.platformPnl.toFixed(2)}`);
        this.currentEngine = null;
        this.currentRunId = null;
      },
      onActivity,
    );

    return run.id;
  }

  async stopRun(): Promise<void> {
    if (!this.currentEngine) return;
    this.currentEngine.stop();

    if (this.currentRunId) {
      const metrics = this.currentEngine.getMetrics();
      await this.prisma.backtestRun.update({
        where: { id: this.currentRunId },
        data: {
          status: 'STOPPED',
          totalBets: metrics.totalBets,
          totalWon: metrics.totalWon,
          totalLost: metrics.totalLost,
          totalStaked: metrics.totalStaked,
          totalPaidOut: metrics.totalPaidOut,
          platformPnl: metrics.platformPnl,
          completedAt: new Date(),
        },
      });
    }

    this.currentEngine = null;
    this.currentRunId = null;
  }

  async listRuns() {
    return this.prisma.backtestRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  isRunning(): boolean {
    return this.currentEngine !== null;
  }
}
