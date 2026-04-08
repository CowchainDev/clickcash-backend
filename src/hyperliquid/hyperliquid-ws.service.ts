import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import WebSocket from 'ws';
import { HlAllMids } from './types';

const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

@Injectable()
export class HyperliquidWsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HyperliquidWsService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private destroyed = false;

  /** Emits raw allMids snapshots from HyperLiquid */
  readonly mids$ = new Subject<HlAllMids>();

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.destroyed) return;

    this.logger.log('Connecting to HyperLiquid WebSocket...');
    this.ws = new WebSocket(HL_WS_URL);

    this.ws.on('open', () => {
      this.logger.log('Connected to HyperLiquid WS');
      this.reconnectDelay = 1000;

      // Subscribe to all mid prices
      this.ws!.send(
        JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids' },
        }),
      );
    });

    this.ws.on('message', (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.channel === 'allMids' && msg.data?.mids) {
          this.mids$.next(msg.data.mids as HlAllMids);
        }
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on('close', () => {
      this.logger.warn('HyperLiquid WS closed, reconnecting...');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.logger.error(`HyperLiquid WS error: ${err.message}`);
      this.ws?.close();
    });
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}
