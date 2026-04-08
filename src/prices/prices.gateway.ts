import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { PricesService } from './prices.service';

@WebSocketGateway({
  namespace: '/prices',
  cors: { origin: '*' },
})
export class PricesGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PricesGateway.name);
  private tickSub: Subscription | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(private readonly pricesService: PricesService) {}

  afterInit() {
    // Fan out ticks to Socket.IO rooms
    this.tickSub = this.pricesService.ticks$.subscribe((tick) => {
      this.server.to(tick.pair).emit('priceTick', tick);
    });
    this.logger.log('Prices gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, data: { pair: string }) {
    const pair = data?.pair;
    if (!pair) {
      client.emit('error', { message: 'pair is required' });
      return;
    }

    // Leave all other pair rooms first (one pair per client)
    for (const room of client.rooms) {
      if (room !== client.id) {
        client.leave(room);
      }
    }

    client.join(pair);
    this.logger.debug(`Client ${client.id} subscribed to ${pair}`);

    // Send current price immediately if available
    const price = this.pricesService.getLatestPrice(pair);
    if (price !== null) {
      client.emit('priceTick', {
        pair,
        price,
        timestamp: Date.now(),
      });
    }

    client.emit('status', { connected: true, subscribedPair: pair });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, data: { pair: string }) {
    if (data?.pair) {
      client.leave(data.pair);
      this.logger.debug(`Client ${client.id} unsubscribed from ${data.pair}`);
    }
  }
}
