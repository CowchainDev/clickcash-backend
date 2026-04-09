import { Injectable, Logger } from '@nestjs/common';
import { computeEMA } from './sim-math';
import type { SimTick } from './types';

const BINANCE_KLINES_URL = 'https://api.binance.com/api/v3/klines';
const TICKS_PER_CANDLE = 300; // 1 minute / 200ms = 300 ticks
const TICK_INTERVAL_MS = 200;

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  closeTime: number;
}

@Injectable()
export class PriceReplayService {
  private readonly logger = new Logger(PriceReplayService.name);

  async fetchKlines(startTime: number, endTime: number): Promise<Kline[]> {
    const klines: Kline[] = [];
    let cursor = startTime;

    while (cursor < endTime) {
      const url = `${BINANCE_KLINES_URL}?symbol=BTCUSDT&interval=1m&startTime=${cursor}&endTime=${endTime}&limit=1000`;
      this.logger.log(`Fetching klines from ${new Date(cursor).toISOString()}...`);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Binance API error: ${res.status}`);

      const data = await res.json();
      if (data.length === 0) break;

      for (const k of data) {
        klines.push({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          closeTime: k[6],
        });
      }

      cursor = data[data.length - 1][6] + 1; // closeTime + 1ms

      // Rate limit: 100ms between requests
      await new Promise((r) => setTimeout(r, 100));
    }

    this.logger.log(`Fetched ${klines.length} klines (${Math.round(klines.length / 60)}h of data)`);
    return klines;
  }

  interpolateToTicks(klines: Kline[]): SimTick[] {
    const ticks: SimTick[] = [];
    let emaPrice: number | null = null;
    let lastTickMs: number | null = null;

    for (const kline of klines) {
      const { open, high, low, close, openTime } = kline;
      const isBullish = close >= open;

      // Path: open → low/high → high/low → close (4-segment path)
      const path = isBullish
        ? [open, low, high, close]
        : [open, high, low, close];

      for (let i = 0; i < TICKS_PER_CANDLE; i++) {
        const t = i / (TICKS_PER_CANDLE - 1); // 0..1
        const timestamp = openTime + i * TICK_INTERVAL_MS;

        // Interpolate along 3-segment path
        let rawPrice: number;
        if (t < 0.33) {
          const seg = t / 0.33;
          rawPrice = path[0] + (path[1] - path[0]) * seg;
        } else if (t < 0.66) {
          const seg = (t - 0.33) / 0.33;
          rawPrice = path[1] + (path[2] - path[1]) * seg;
        } else {
          const seg = (t - 0.66) / 0.34;
          rawPrice = path[2] + (path[3] - path[2]) * seg;
        }

        // Add small noise for realism
        rawPrice += (Math.random() - 0.5) * 1.0;

        // EMA smoothing
        if (emaPrice === null) {
          emaPrice = rawPrice;
          lastTickMs = timestamp;
        } else {
          const deltaSec = Math.max((timestamp - lastTickMs!) / 1000, 0.001);
          emaPrice = computeEMA(rawPrice, emaPrice, deltaSec);
          lastTickMs = timestamp;
        }

        ticks.push({ rawPrice, emaPrice, timestamp });
      }
    }

    this.logger.log(`Interpolated ${ticks.length} ticks from ${klines.length} klines`);
    return ticks;
  }
}
