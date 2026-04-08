import { OnModuleInit } from '@nestjs/common';
import { HyperliquidService } from '../hyperliquid/hyperliquid.service';
export interface PairInfo {
    coin: string;
    label: string;
}
export declare class PairsService implements OnModuleInit {
    private readonly hl;
    private readonly logger;
    private pairs;
    private lastFetch;
    private readonly TTL;
    constructor(hl: HyperliquidService);
    onModuleInit(): Promise<void>;
    getPairs(): Promise<PairInfo[]>;
    private refresh;
}
