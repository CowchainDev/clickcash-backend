import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { HyperliquidWsService } from '../hyperliquid/hyperliquid-ws.service';
import { PriceTick } from './dto/price-tick.dto';
export declare class PricesService implements OnModuleInit, OnModuleDestroy {
    private readonly hlWs;
    private readonly logger;
    private latestPrices;
    readonly ticks$: Subject<PriceTick>;
    private sub;
    private interval;
    constructor(hlWs: HyperliquidWsService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    getLatestPrice(pair: string): number | null;
}
