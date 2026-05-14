import { Module } from '@nestjs/common';
import { WarehouseStocksService } from './warehouse-stocks.service';
import { WarehouseStocksController } from './warehouse-stocks.controller';

@Module({
  controllers: [WarehouseStocksController],
  providers: [WarehouseStocksService],
})
export class WarehouseStocksModule {}