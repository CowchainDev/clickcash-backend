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
import { GridService } from './grid.service';
import { BetService, PlaceBetDto } from './bet.service';
import { UserService } from './user.service';
import { PriceEngineService } from '../prices/price-engine.service';

@WebSocketGateway({
  namespace: '/game',
  cors: { origin: '*' },
})
export class BetGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(BetGateway.name);
  private gridInterval: ReturnType<typeof setInterval> | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly gridService: GridService,
    private readonly betService: BetService,
    private readonly userService: UserService,
    private readonly priceEngine: PriceEngineService,
  ) {}

  afterInit() {
    // Broadcast grid updates every 200ms
    this.gridInterval = setInterval(async () => {
      try {
        const grid = await this.gridService.buildGridUpdate(6);
        if (grid) {
          this.server.emit('gridUpdate', grid);
        }
      } catch {
        // ignore errors during grid build
      }
    }, 200);

    // Broadcast EMA price every 200ms
    setInterval(() => {
      const price = this.priceEngine.currentEmaPrice;
      if (price) {
        this.server.emit('priceTick', { price, timestamp: Date.now() });
      }
    }, 200);

    this.logger.log('Game gateway initialized');
  }

  async handleConnection(client: Socket) {
    // Create session user
    const userId = client.id;
    await this.userService.getOrCreateUser(userId);

    const balance = await this.userService.getBalance(userId);
    client.emit('balanceUpdate', { balance });

    // Send initial grid
    const grid = await this.gridService.buildGridUpdate(6);
    if (grid) client.emit('gridUpdate', grid);

    // Send demo mode flag
    client.emit('config', { simulated: this.priceEngine.isSimulated });

    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('placeBet')
  async handlePlaceBet(client: Socket, data: { cellLow: number; cellHigh: number; slotMs: number; stake: number }) {
    const dto: PlaceBetDto = {
      userId: client.id,
      cellLow: data.cellLow,
      cellHigh: data.cellHigh,
      slotMs: data.slotMs,
      stake: data.stake,
    };

    const result = await this.betService.placeBet(dto);

    if (result.success) {
      // Send bet confirmation
      client.emit('betPlaced', {
        bet: result.bet,
        message: `Bet placed: ${result.bet.multiplier}x on $${data.cellLow.toLocaleString()}`,
      });

      // Send updated balance
      const balance = await this.userService.getBalance(client.id);
      client.emit('balanceUpdate', { balance });
    } else {
      client.emit('betError', { reason: result.reason });
    }

    return result;
  }

  @SubscribeMessage('getBalance')
  async handleGetBalance(client: Socket) {
    const balance = await this.userService.getBalance(client.id);
    client.emit('balanceUpdate', { balance });
  }

  @SubscribeMessage('getActiveBets')
  async handleGetActiveBets(client: Socket) {
    // Could query DB for active bets by userId
    client.emit('activeBets', { bets: [] });
  }
}
