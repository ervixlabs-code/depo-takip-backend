import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseStocksService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const stocks = await this.prisma.warehouseStock.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return Promise.all(
      stocks.map(async (stock) => {
        const lastMovement = await this.prisma.stockMovement.findFirst({
          where: {
            productId: stock.productId,
            warehouseId: stock.warehouseId,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        return {
          id: stock.id,
          productId: stock.productId,
          productName: stock.product.name,
          sku: stock.product.sku,
          barcode: stock.product.barcode,
          category: stock.product.category,
          warehouseId: stock.warehouseId,
          warehouse: stock.warehouse.name,
          stock: stock.quantity,
          minStock: stock.minStock,
          unit: stock.unit,
          lastMovement: lastMovement?.type ?? null,
          updatedAt: stock.updatedAt,
        };
      }),
    );
  }

  async findOne(id: string) {
    const stock = await this.prisma.warehouseStock.findUnique({
      where: {
        id,
      },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!stock) {
      return null;
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        productId: stock.productId,
        warehouseId: stock.warehouseId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    });

    return {
      id: stock.id,
      quantity: stock.quantity,
      minStock: stock.minStock,
      unit: stock.unit,
      updatedAt: stock.updatedAt,

      product: {
        id: stock.product.id,
        name: stock.product.name,
        sku: stock.product.sku,
        barcode: stock.product.barcode,
        category: stock.product.category,
        purchasePrice: stock.product.purchasePrice,
        salePrice: stock.product.salePrice,
      },

      warehouse: {
        id: stock.warehouse.id,
        name: stock.warehouse.name,
        code: stock.warehouse.code,
        city: stock.warehouse.city,
      },

      movements,
    };
  }

  async findCritical() {
    const stocks = await this.prisma.warehouseStock.findMany({
      include: {
        product: true,
        warehouse: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return stocks
      .filter((stock) => stock.quantity <= stock.minStock)
      .map((stock) => {
        const shortage = Math.max(stock.minStock - stock.quantity, 0);
        const percent =
          stock.minStock > 0 ? stock.quantity / stock.minStock : 1;

        let priority: 'Kritik' | 'Yüksek' | 'Orta' = 'Orta';

        if (percent <= 0.3) priority = 'Kritik';
        else if (percent <= 0.6) priority = 'Yüksek';

        return {
          id: stock.id,
          productId: stock.productId,
          product: stock.product.name,
          sku: stock.product.sku,
          barcode: stock.product.barcode,
          category: stock.product.category,
          warehouseId: stock.warehouseId,
          warehouse: stock.warehouse.name,
          stock: stock.quantity,
          minStock: stock.minStock,
          unit: stock.unit,
          shortage,
          priority,
          updatedAt: stock.updatedAt,
        };
      });
  }
}
