import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import WebSocket from 'ws';
import { RedisService } from '../redis/redis.service';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws/btcusdt@trade';
const EMA_TAU = 0.5; // seconds

@Injectable()
export class PriceEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceEngineService.name);
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectDelay = 1000;

  // EMA state
  private emaPrice: number | null = null;
  private lastTickMs: number | null = null;
  private simulating = false;
  private simInterval: ReturnType<typeof setInterval> | null = null;

  /** Emits EMA-smoothed price ticks */
  readonly emaTick$ = new Subject<{ price: number; timestamp: number; raw: number }>();

  /** Whether we're in demo/simulation mode */
  get isSimulated(): boolean {
    return this.simulating;
  }

  get currentEmaPrice(): number | null {
    return this.emaPrice;
  }

  constructor(private readonly redis: RedisService) {}

  onModuleInit() {
    this.connectBinance();

    // Fallback: if no price after 5 seconds, start simulation
    setTimeout(() => {
      if (this.emaPrice === null) {
        this.logger.warn('Binance WS not connected after 5s, starting simulation');
        this.startSimulation();
      }
    }, 5000);
  }

  onModuleDestroy() {
    this.destroyed = true;
    this.ws?.close();
    if (this.simInterval) clearInterval(this.simInterval);
  }

  private connectBinance() {
    if (this.destroyed) return;

    this.logger.log('Connecting to Binance WS...');
    this.ws = new WebSocket(BINANCE_WS);

    this.ws.on('open', () => {
      this.logger.log('Connected to Binance BTC/USDT');
      this.reconnectDelay = 1000;
      // Stop simulation if it was running
      if (this.simInterval) {
        clearInterval(this.simInterval);
        this.simInterval = null;
        this.simulating = false;
      }
    });

    this.ws.on('message', (raw: WebSocket.Data) => {
      try {
        const data = JSON.parse(raw.toString());
        const rawPrice = parseFloat(data.p);
        const timestamp = data.T; // milliseconds
        this.processTick(rawPrice, timestamp);
      } catch {
        // ignore parse errors
      }
    });

    this.ws.on('close', () => {
      this.logger.warn('Binance WS closed');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.logger.error(`Binance WS error: ${err.message}`);
      this.ws?.close();
    });
  }

  private scheduleReconnect() {
    if (this.destroyed) return;
    setTimeout(() => this.connectBinance(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  private startSimulation() {
    this.simulating = true;
    let price = 95000 + Math.random() * 2000;

    this.simInterval = setInterval(() => {
      const change = (Math.random() - 0.5) * 6;
      const revert = (96000 - price) * 0.0003;
      price += change + revert;
      this.processTick(price, Date.now());
    }, 150);
  }

  private processTick(rawPrice: number, tickMs: number) {
    // EMA smoothing
    if (this.emaPrice === null) {
      this.emaPrice = rawPrice;
      this.lastTickMs = tickMs;
    } else {
      const deltaT = Math.max((tickMs - this.lastTickMs!) / 1000, 0.001);
      const alpha = 1 - Math.exp(-deltaT / EMA_TAU);
      this.emaPrice = alpha * rawPrice + (1 - alpha) * this.emaPrice;
      this.lastTickMs = tickMs;
    }

    // Store in Redis
    this.redis.setEmaPrice(this.emaPrice, tickMs).catch(() => {});
    this.redis.pushEmaBuffer(this.emaPrice, tickMs).catch(() => {});

    // Emit
    this.emaTick$.next({
      price: this.emaPrice,
      timestamp: tickMs,
      raw: rawPrice,
    });
  }
}
