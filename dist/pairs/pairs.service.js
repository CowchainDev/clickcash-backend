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
var PairsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PairsService = void 0;
const common_1 = require("@nestjs/common");
const hyperliquid_service_1 = require("../hyperliquid/hyperliquid.service");
let PairsService = PairsService_1 = class PairsService {
    hl;
    logger = new common_1.Logger(PairsService_1.name);
    pairs = [];
    lastFetch = 0;
    TTL = 5 * 60 * 1000;
    constructor(hl) {
        this.hl = hl;
    }
    async onModuleInit() {
        await this.refresh();
    }
    async getPairs() {
        if (Date.now() - this.lastFetch > this.TTL) {
            await this.refresh();
        }
        return this.pairs;
    }
    async refresh() {
        try {
            const meta = await this.hl.fetchMeta();
            this.pairs = meta.universe.map((a) => ({
                coin: a.name,
                label: `${a.name}/USD`,
            }));
            this.lastFetch = Date.now();
            this.logger.log(`Loaded ${this.pairs.length} pairs`);
        }
        catch (err) {
            this.logger.error(`Failed to fetch pairs: ${err}`);
        }
    }
};
exports.PairsService = PairsService;
exports.PairsService = PairsService = PairsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hyperliquid_service_1.HyperliquidService])
], PairsService);
//# sourceMappingURL=pairs.service.js.map