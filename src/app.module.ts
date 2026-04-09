import { Module } from '@nestjs/common';
import { HyperliquidModule } from './hyperliquid/hyperliquid.module';
import { PairsModule } from './pairs/pairs.module';
import { PricesModule } from './prices/prices.module';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    HyperliquidModule,
    PairsModule,
    PricesModule,
    GameModule,
  ],
})
export class AppModule {}
