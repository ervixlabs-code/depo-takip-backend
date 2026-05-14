import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StockMovementsService } from './stock-movements.service';
import { CreateStockInDto } from './dto/create-stock-in.dto';
import { CreateStockOutDto } from './dto/create-stock-out.dto';

@ApiTags('Stock Movements')
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovementsService: StockMovementsService) {}

  @Post('in')
  stockIn(@Body() dto: CreateStockInDto) {
    return this.stockMovementsService.stockIn(dto);
  }

  @Post('out')
  stockOut(@Body() dto: CreateStockOutDto) {
    return this.stockMovementsService.stockOut(dto);
  }

  @Get()
  findAll() {
    return this.stockMovementsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockMovementsService.findOne(id);
  }
}
