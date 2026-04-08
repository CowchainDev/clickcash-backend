import { Module } from '@nestjs/common';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { PricesService } from './prices.service';
import { PricesGateway } from './prices.gateway';

@Module({
  imports: [HyperliquidModule],
  providers: [PricesService, PricesGateway],
})
export class PricesModule {}
