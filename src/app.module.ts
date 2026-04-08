import { Module } from '@nestjs/common';
import { HyperliquidModule } from './hyperliquid/hyperliquid.module';
import { PairsModule } from './pairs/pairs.module';
import { PricesModule } from './prices/prices.module';

@Module({
  imports: [HyperliquidModule, PairsModule, PricesModule],
})
export class AppModule {}
