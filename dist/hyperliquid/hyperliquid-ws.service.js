"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var HyperliquidWsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperliquidWsService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const ws_1 = __importDefault(require("ws"));
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
let HyperliquidWsService = HyperliquidWsService_1 = class HyperliquidWsService {
    logger = new common_1.Logger(HyperliquidWsService_1.name);
    ws = null;
    reconnectTimer = null;
    reconnectDelay = 1000;
    destroyed = false;
    mids$ = new rxjs_1.Subject();
    onModuleInit() {
        this.connect();
    }
    onModuleDestroy() {
        this.destroyed = true;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.ws?.close();
    }
    connect() {
        if (this.destroyed)
            return;
        this.logger.log('Connecting to HyperLiquid WebSocket...');
        this.ws = new ws_1.default(HL_WS_URL);
        this.ws.on('open', () => {
            this.logger.log('Connected to HyperLiquid WS');
            this.reconnectDelay = 1000;
            this.ws.send(JSON.stringify({
                method: 'subscribe',
                subscription: { type: 'allMids' },
            }));
        });
        this.ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.channel === 'allMids' && msg.data?.mids) {
                    this.mids$.next(msg.data.mids);
                }
            }
            catch {
            }
        });
        this.ws.on('close', () => {
            this.logger.warn('HyperLiquid WS closed, reconnecting...');
            this.scheduleReconnect();
        });
        this.ws.on('error', (err) => {
            this.logger.error(`HyperLiquid WS error: ${err.message}`);
            this.ws?.close();
        });
    }
    scheduleReconnect() {
        if (this.destroyed)
            return;
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
};
exports.HyperliquidWsService = HyperliquidWsService;
exports.HyperliquidWsService = HyperliquidWsService = HyperliquidWsService_1 = __decorate([
    (0, common_1.Injectable)()
], HyperliquidWsService);
//# sourceMappingURL=hyperliquid-ws.service.js.map