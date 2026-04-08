import { Controller, Get } from '@nestjs/common';
import { PairsService } from './pairs.service';

@Controller('api/pairs')
export class PairsController {
  constructor(private readonly pairsService: PairsService) {}

  @Get()
  async list() {
    return this.pairsService.getPairs();
  }
}
