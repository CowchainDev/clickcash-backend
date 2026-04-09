import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ── Price state ──

  async setEmaPrice(price: number, timestamp: number): Promise<void> {
    await this.client.hmset('ema', { price: price.toString(), timestamp: timestamp.toString() });
  }

  async getEmaPrice(): Promise<{ price: number; timestamp: number } | null> {
    const data = await this.client.hgetall('ema');
    if (!data.price) return null;
    return { price: parseFloat(data.price), timestamp: parseInt(data.timestamp) };
  }

  // ── EMA buffer (for volatility calc) ──

  async pushEmaBuffer(price: number, timestamp: number): Promise<void> {
    await this.client.zadd('ema_buffer', timestamp, `${timestamp}:${price}`);
    // Trim entries older than 5 minutes
    const cutoff = timestamp - 5 * 60 * 1000;
    await this.client.zremrangebyscore('ema_buffer', '-inf', cutoff);
  }

  async getEmaBuffer(sinceMs: number): Promise<{ t: number; p: number }[]> {
    const entries = await this.client.zrangebyscore('ema_buffer', sinceMs, '+inf');
    return entries.map((entry) => {
      const [ts, price] = entry.split(':');
      return { t: parseInt(ts), p: parseFloat(price) };
    });
  }

  // ── Volatility state ──

  async setSigma(horizon: number, value: number): Promise<void> {
    await this.client.hset('sigma', horizon.toString(), value.toString());
  }

  async getSigma(horizon: number): Promise<number | null> {
    const val = await this.client.hget('sigma', horizon.toString());
    return val ? parseFloat(val) : null;
  }

  async setCellSize(size: number): Promise<void> {
    await this.client.set('cell_size', size.toString());
  }

  async getCellSize(): Promise<number> {
    const val = await this.client.get('cell_size');
    return val ? parseInt(val) : 10;
  }

  // ── Kill switch ──

  async setBettingPaused(until: number): Promise<void> {
    await this.client.set('betting_paused_until', until.toString());
  }

  async isBettingPaused(): Promise<boolean> {
    const val = await this.client.get('betting_paused_until');
    if (!val) return false;
    return Date.now() < parseInt(val);
  }

  // ── Generic ──

  get redis(): Redis {
    return this.client;
  }
}
