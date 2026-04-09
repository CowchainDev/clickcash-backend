import { Module } from '@nestjs/common';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { PricesService } from './prices.service';
import { PricesGateway } from './prices.gateway';
import { PriceEngineService } from './price-engine.service';
import { VolatilityService } from './volatility.service';

@Module({
  imports: [HyperliquidModule],
  providers: [PricesService, PricesGateway, PriceEngineService, VolatilityService],
  exports: [PricesService, PriceEngineService, VolatilityService],
})
export class PricesModule {}
