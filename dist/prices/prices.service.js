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
var PricesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricesService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const hyperliquid_ws_service_1 = require("../hyperliquid/hyperliquid-ws.service");
let PricesService = PricesService_1 = class PricesService {
    hlWs;
    logger = new common_1.Logger(PricesService_1.name);
    latestPrices = new Map();
    ticks$ = new rxjs_1.Subject();
    sub = null;
    interval = null;
    constructor(hlWs) {
        this.hlWs = hlWs;
    }
    onModuleInit() {
        this.sub = this.hlWs.mids$.subscribe((mids) => {
            for (const [coin, priceStr] of Object.entries(mids)) {
                const price = parseFloat(priceStr);
                if (!isNaN(price)) {
                    this.latestPrices.set(coin, price);
                }
            }
        });
        this.interval = setInterval(() => {
            const now = Date.now();
            for (const [pair, price] of this.latestPrices) {
                this.ticks$.next({ pair, price, timestamp: now });
            }
        }, 1000);
    }
    onModuleDestroy() {
        this.sub?.unsubscribe();
        if (this.interval)
            clearInterval(this.interval);
    }
    getLatestPrice(pair) {
        return this.latestPrices.get(pair) ?? null;
    }
};
exports.PricesService = PricesService;
exports.PricesService = PricesService = PricesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hyperliquid_ws_service_1.HyperliquidWsService])
], PricesService);
//# sourceMappingURL=prices.service.js.map