"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PricesGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricesGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const prices_service_1 = require("./prices.service");
let PricesGateway = PricesGateway_1 = class PricesGateway {
    pricesService;
    logger = new common_1.Logger(PricesGateway_1.name);
    tickSub = null;
    server;
    constructor(pricesService) {
        this.pricesService = pricesService;
    }
    afterInit() {
        this.tickSub = this.pricesService.ticks$.subscribe((tick) => {
            this.server.to(tick.pair).emit('priceTick', tick);
        });
        this.logger.log('Prices gateway initialized');
    }
    handleConnection(client) {
        this.logger.debug(`Client connected: ${client.id}`);
    }
    handleDisconnect(client) {
        this.logger.debug(`Client disconnected: ${client.id}`);
    }
    handleSubscribe(client, data) {
        const pair = data?.pair;
        if (!pair) {
            client.emit('error', { message: 'pair is required' });
            return;
        }
        for (const room of client.rooms) {
            if (room !== client.id) {
                client.leave(room);
            }
        }
        client.join(pair);
        this.logger.debug(`Client ${client.id} subscribed to ${pair}`);
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
    handleUnsubscribe(client, data) {
        if (data?.pair) {
            client.leave(data.pair);
            this.logger.debug(`Client ${client.id} unsubscribed from ${data.pair}`);
        }
    }
};
exports.PricesGateway = PricesGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], PricesGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], PricesGateway.prototype, "handleSubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('unsubscribe'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], PricesGateway.prototype, "handleUnsubscribe", null);
exports.PricesGateway = PricesGateway = PricesGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/prices',
        cors: { origin: '*' },
    }),
    __metadata("design:paramtypes", [prices_service_1.PricesService])
], PricesGateway);
//# sourceMappingURL=prices.gateway.js.map