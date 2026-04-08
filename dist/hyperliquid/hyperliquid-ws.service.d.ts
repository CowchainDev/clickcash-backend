import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import { HlAllMids } from './types';
export declare class HyperliquidWsService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private ws;
    private reconnectTimer;
    private reconnectDelay;
    private destroyed;
    readonly mids$: Subject<HlAllMids>;
    onModuleInit(): void;
    onModuleDestroy(): void;
    private connect;
    private scheduleReconnect;
}
