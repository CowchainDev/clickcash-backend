import { Module } from '@nestjs/common';
import { HyperliquidService } from './hyperliquid.service';
import { HyperliquidWsService } from './hyperliquid-ws.service';

@Module({
  providers: [HyperliquidService, HyperliquidWsService],
  exports: [HyperliquidService, HyperliquidWsService],
})
export class HyperliquidModule {}
