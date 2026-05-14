import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WarehouseStocksService } from './warehouse-stocks.service';

@ApiTags('Warehouse Stocks')
@Controller('warehouse-stocks')
export class WarehouseStocksController {
  constructor(private readonly service: WarehouseStocksService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('critical')
  findCritical() {
    return this.service.findCritical();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
