import { Module } from '@nestjs/common';
import { HyperliquidModule } from '../hyperliquid/hyperliquid.module';
import { PairsController } from './pairs.controller';
import { PairsService } from './pairs.service';

@Module({
  imports: [HyperliquidModule],
  controllers: [PairsController],
  providers: [PairsService],
})
export class PairsModule {}
