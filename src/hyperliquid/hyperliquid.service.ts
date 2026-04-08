import { Injectable, Logger } from '@nestjs/common';
import { HlPerpMeta, HlAllMids } from './types';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';

@Injectable()
export class HyperliquidService {
  private readonly logger = new Logger(HyperliquidService.name);

  async fetchMeta(): Promise<HlPerpMeta> {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'meta' }),
    });
    if (!res.ok) throw new Error(`HL meta request failed: ${res.status}`);
    return res.json();
  }

  async fetchAllMids(): Promise<HlAllMids> {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
    });
    if (!res.ok) throw new Error(`HL allMids request failed: ${res.status}`);
    return res.json();
  }
}
