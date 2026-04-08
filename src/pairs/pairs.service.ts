import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HyperliquidService } from '../hyperliquid/hyperliquid.service';

export interface PairInfo {
  coin: string;
  label: string;
}

@Injectable()
export class PairsService implements OnModuleInit {
  private readonly logger = new Logger(PairsService.name);
  private pairs: PairInfo[] = [];
  private lastFetch = 0;
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly hl: HyperliquidService) {}

  async onModuleInit() {
    await this.refresh();
  }

  async getPairs(): Promise<PairInfo[]> {
    if (Date.now() - this.lastFetch > this.TTL) {
      await this.refresh();
    }
    return this.pairs;
  }

  private async refresh() {
    try {
      const meta = await this.hl.fetchMeta();
      this.pairs = meta.universe.map((a) => ({
        coin: a.name,
        label: `${a.name}/USD`,
      }));
      this.lastFetch = Date.now();
      this.logger.log(`Loaded ${this.pairs.length} pairs`);
    } catch (err) {
      this.logger.error(`Failed to fetch pairs: ${err}`);
    }
  }
}
