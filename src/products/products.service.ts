import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const skuExists = await this.prisma.product.findUnique({
      where: { sku: dto.sku },
    });

    if (skuExists) {
      throw new ConflictException('Bu SKU zaten kullanılıyor.');
    }

    if (dto.barcode) {
      const barcodeExists = await this.prisma.product.findUnique({
        where: { barcode: dto.barcode },
      });

      if (barcodeExists) {
        throw new ConflictException('Bu barkod zaten kullanılıyor.');
      }
    }

    if ((dto.initialStock ?? 0) > 0 && !dto.warehouseId) {
      throw new BadRequestException(
        'Başlangıç stoğu girildiğinde depo seçilmelidir.',
      );
    }

    if (dto.warehouseId) {
      const warehouse = await this.prisma.warehouse.findUnique({
        where: { id: dto.warehouseId },
      });

      if (!warehouse) {
        throw new NotFoundException('Depo bulunamadı.');
      }
    }

    const { warehouseId, initialStock, ...productData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: productData,
      });

      if (warehouseId) {
        await tx.warehouseStock.create({
          data: {
            productId: product.id,
            warehouseId,
            quantity: initialStock ?? 0,
            minStock: dto.minStock ?? 0,
            unit: dto.unit ?? 'Adet',
          },
        });

        if ((initialStock ?? 0) > 0) {
          await tx.stockMovement.create({
            data: {
              type: 'IN',
              productId: product.id,
              warehouseId,
              quantity: initialStock ?? 0,
              previousQuantity: 0,
              nextQuantity: initialStock ?? 0,
              documentNo: 'INITIAL-STOCK',
              responsible: 'SYSTEM',
              note: 'Ürün oluşturulurken başlangıç stoğu girildi.',
            },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          warehouseStocks: {
            include: {
              warehouse: true,
            },
          },
        },
      });
    });
  }

  async findAll() {
    return this.prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        warehouseStocks: {
          include: {
            warehouse: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        warehouseStocks: {
          include: {
            warehouse: true,
          },
        },
        movements: {
          orderBy: { createdAt: 'desc' },
          include: {
            warehouse: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı.');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.sku) {
      const skuExists = await this.prisma.product.findUnique({
        where: { sku: dto.sku },
      });

      if (skuExists && skuExists.id !== id) {
        throw new ConflictException('Bu SKU başka bir üründe kullanılıyor.');
      }
    }

    if (dto.barcode) {
      const barcodeExists = await this.prisma.product.findUnique({
        where: { barcode: dto.barcode },
      });

      if (barcodeExists && barcodeExists.id !== id) {
        throw new ConflictException('Bu barkod başka bir üründe kullanılıyor.');
      }
    }

    const { warehouseId, initialStock, ...productData } = dto;

    return this.prisma.product.update({
      where: { id },
      data: productData,
      include: {
        warehouseStocks: {
          include: {
            warehouse: true,
          },
        },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.product.delete({
      where: { id },
    });
  }
}
