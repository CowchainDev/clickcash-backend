import { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PricesService } from './prices.service';
export declare class PricesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly pricesService;
    private readonly logger;
    private tickSub;
    server: Server;
    constructor(pricesService: PricesService);
    afterInit(): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleSubscribe(client: Socket, data: {
        pair: string;
    }): void;
    handleUnsubscribe(client: Socket, data: {
        pair: string;
    }): void;
}
