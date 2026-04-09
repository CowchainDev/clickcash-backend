import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { BacktestService } from './backtest.service';

@Controller('api/backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Post('start')
  async start(@Body() body: {
    startTime: string;
    endTime: string;
    numUsers?: number;
    speedMultiplier?: number;
    strategyMix?: { random: number; centerBiased: number; edgeChaser: number; streakFollower: number };
  }) {
    if (this.backtestService.isRunning()) {
      return { error: 'A backtest is already running' };
    }

    const config = {
      startTime: new Date(body.startTime).getTime(),
      endTime: new Date(body.endTime).getTime(),
      numUsers: body.numUsers || 100,
      speedMultiplier: body.speedMultiplier || 120,
      strategyMix: body.strategyMix || { random: 0.4, centerBiased: 0.25, edgeChaser: 0.2, streakFollower: 0.15 },
    };

    // Start run — ticks will be emitted via WebSocket gateway
    const runId = await this.backtestService.startRun(config, () => {});
    return { runId };
  }

  @Post(':runId/stop')
  async stop() {
    await this.backtestService.stopRun();
    return { status: 'stopped' };
  }

  @Get('runs')
  async listRuns() {
    return this.backtestService.listRuns();
  }
}
