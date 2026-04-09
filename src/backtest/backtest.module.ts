import { Module } from '@nestjs/common';
import { BacktestService } from './backtest.service';
import { BacktestController } from './backtest.controller';
import { BacktestGateway } from './backtest.gateway';
import { PriceReplayService } from './price-replay.service';

@Module({
  providers: [BacktestService, BacktestGateway, PriceReplayService],
  controllers: [BacktestController],
})
export class BacktestModule {}
