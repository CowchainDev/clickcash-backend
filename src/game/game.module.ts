import { Module } from '@nestjs/common';
import { GridService } from './grid.service';
import { MultiplierService } from './multiplier.service';
import { InventoryService } from './inventory.service';
import { SlotsService } from './slots.service';
import { BetService } from './bet.service';
import { BetGateway } from './bet.gateway';
import { UserService } from './user.service';
import { PricesModule } from '../prices/prices.module';

@Module({
  imports: [PricesModule],
  providers: [
    GridService,
    MultiplierService,
    InventoryService,
    SlotsService,
    BetService,
    BetGateway,
    UserService,
  ],
  exports: [GridService, MultiplierService, BetService, UserService],
})
export class GameModule {}
