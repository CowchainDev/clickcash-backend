import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { BacktestService } from './backtest.service';
import type { BacktestConfig } from './types';

@WebSocketGateway({
  namespace: '/backtest',
  cors: { origin: '*' },
})
export class BacktestGateway implements OnGatewayInit {
  private readonly logger = new Logger(BacktestGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly backtestService: BacktestService) {}

  afterInit() {
    this.logger.log('Backtest gateway initialized');
  }

  @SubscribeMessage('startBacktest')
  async handleStart(client: Socket, config: BacktestConfig) {
    if (this.backtestService.isRunning()) {
      client.emit('backtestError', { reason: 'A backtest is already running' });
      return;
    }

    try {
      const runId = await this.backtestService.startRun(
        config,
        (tick) => this.server.emit('backtestTick', tick),
        (events) => this.server.emit('backtestActivity', events),
      );

      client.emit('backtestStarted', { runId });
    } catch (err: any) {
      client.emit('backtestError', { reason: err.message });
    }
  }

  @SubscribeMessage('stopBacktest')
  async handleStop(client: Socket) {
    await this.backtestService.stopRun();
    this.server.emit('backtestComplete', {});
  }
}
