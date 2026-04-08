"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var HyperliquidService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperliquidService = void 0;
const common_1 = require("@nestjs/common");
const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
let HyperliquidService = HyperliquidService_1 = class HyperliquidService {
    logger = new common_1.Logger(HyperliquidService_1.name);
    async fetchMeta() {
        const res = await fetch(HL_INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'meta' }),
        });
        if (!res.ok)
            throw new Error(`HL meta request failed: ${res.status}`);
        return res.json();
    }
    async fetchAllMids() {
        const res = await fetch(HL_INFO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'allMids' }),
        });
        if (!res.ok)
            throw new Error(`HL allMids request failed: ${res.status}`);
        return res.json();
    }
};
exports.HyperliquidService = HyperliquidService;
exports.HyperliquidService = HyperliquidService = HyperliquidService_1 = __decorate([
    (0, common_1.Injectable)()
], HyperliquidService);
//# sourceMappingURL=hyperliquid.service.js.map