import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';
import { HyperliquidWsService } from '../hyperliquid/hyperliquid-ws.service';
import { PriceTick } from './dto/price-tick.dto';

@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricesService.name);

  /** Latest mid price per coin */
  private latestPrices = new Map<string, number>();

  /** Emits aggregated 1s ticks */
  readonly ticks$ = new Subject<PriceTick>();

  private sub: Subscription | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly hlWs: HyperliquidWsService) {}

  onModuleInit() {
    // Listen to raw allMids updates and store latest prices
    this.sub = this.hlWs.mids$.subscribe((mids) => {
      for (const [coin, priceStr] of Object.entries(mids)) {
        const price = parseFloat(priceStr);
        if (!isNaN(price)) {
          this.latestPrices.set(coin, price);
        }
      }
    });

    // Emit 1-second ticks for all tracked coins
    this.interval = setInterval(() => {
      const now = Date.now();
      for (const [pair, price] of this.latestPrices) {
        this.ticks$.next({ pair, price, timestamp: now });
      }
    }, 1000);
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
    if (this.interval) clearInterval(this.interval);
  }

  getLatestPrice(pair: string): number | null {
    return this.latestPrices.get(pair) ?? null;
  }
}
