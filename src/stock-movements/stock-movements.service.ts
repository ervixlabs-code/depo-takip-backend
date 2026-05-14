import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockInDto } from './dto/create-stock-in.dto';
import { CreateStockOutDto } from './dto/create-stock-out.dto';

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async stockIn(dto: CreateStockInDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı.');
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });

      if (!warehouse) {
        throw new NotFoundException('Depo bulunamadı.');
      }

      const currentStock = await tx.warehouseStock.findUnique({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
      });

      const previousQuantity = currentStock?.quantity ?? 0;
      const nextQuantity = previousQuantity + dto.quantity;

      const warehouseStock = currentStock
        ? await tx.warehouseStock.update({
            where: { id: currentStock.id },
            data: {
              quantity: nextQuantity,
              unit: product.unit,
              minStock: product.minStock,
            },
          })
        : await tx.warehouseStock.create({
            data: {
              productId: dto.productId,
              warehouseId: dto.warehouseId,
              quantity: nextQuantity,
              unit: product.unit,
              minStock: product.minStock,
            },
          });

      const movement = await tx.stockMovement.create({
        data: {
          type: StockMovementType.IN,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          previousQuantity,
          nextQuantity,
          documentNo: dto.documentNo,
          responsible: dto.responsible,
          location: dto.location,
          note: dto.note,
        },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return {
        message: 'Stok girişi başarıyla kaydedildi.',
        warehouseStock,
        movement,
      };
    });
  }

  async stockOut(dto: CreateStockOutDto) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
      });

      if (!product) {
        throw new NotFoundException('Ürün bulunamadı.');
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });

      if (!warehouse) {
        throw new NotFoundException('Depo bulunamadı.');
      }

      const currentStock = await tx.warehouseStock.findUnique({
        where: {
          productId_warehouseId: {
            productId: dto.productId,
            warehouseId: dto.warehouseId,
          },
        },
      });

      if (!currentStock) {
        throw new BadRequestException('Bu ürün için seçilen depoda stok bulunmuyor.');
      }

      if (currentStock.quantity < dto.quantity) {
        throw new BadRequestException(
          `Yetersiz stok. Mevcut stok: ${currentStock.quantity}`,
        );
      }

      const previousQuantity = currentStock.quantity;
      const nextQuantity = previousQuantity - dto.quantity;

      const warehouseStock = await tx.warehouseStock.update({
        where: { id: currentStock.id },
        data: {
          quantity: nextQuantity,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: StockMovementType.OUT,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: dto.quantity,
          previousQuantity,
          nextQuantity,
          documentNo: dto.documentNo,
          responsible: dto.responsible,
          location: dto.location,
          note: dto.note,
        },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return {
        message: 'Stok çıkışı başarıyla kaydedildi.',
        warehouseStock,
        movement,
      };
    });
  }

  async findAll() {
    return this.prisma.stockMovement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        product: true,
        warehouse: true,
      },
    });
  }

  async findOne(id: string) {
    const movement = await this.prisma.stockMovement.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!movement) {
      throw new NotFoundException('Stok hareketi bulunamadı.');
    }

    return movement;
  }
}