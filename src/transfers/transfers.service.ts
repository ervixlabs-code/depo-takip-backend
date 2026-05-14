import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockMovementType, TransferStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { UpdateTransferDto } from './dto/update-transfer.dto';

@Injectable()
export class TransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Kaynak depo ile hedef depo aynı olamaz.');
    }

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Ürün bulunamadı.');
    }

    const fromWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.fromWarehouseId },
    });

    if (!fromWarehouse) {
      throw new NotFoundException('Kaynak depo bulunamadı.');
    }

    const toWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.toWarehouseId },
    });

    if (!toWarehouse) {
      throw new NotFoundException('Hedef depo bulunamadı.');
    }

    const code = dto.code || (await this.generateCode());

    const codeExists = await this.prisma.transfer.findUnique({
      where: { code },
    });

    if (codeExists) {
      throw new ConflictException('Bu transfer kodu zaten kullanılıyor.');
    }

    const status = dto.status ?? TransferStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          code,
          productId: dto.productId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          unit: dto.unit ?? product.unit,
          status,
          fromLocation: dto.fromLocation,
          toLocation: dto.toLocation,
          responsible: dto.responsible,
          documentNo: dto.documentNo,
          transferDate: dto.transferDate ? new Date(dto.transferDate) : null,
          note: dto.note,
        },
      });

      if (status === TransferStatus.COMPLETED) {
        await this.applyTransferStock(tx, transfer.id);
      }

      return tx.transfer.findUnique({
        where: { id: transfer.id },
        include: this.defaultInclude(),
      });
    });
  }

  async findAll() {
    return this.prisma.transfer.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.defaultInclude(),
    });
  }

  async findOne(id: string) {
    const transfer = await this.prisma.transfer.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!transfer) {
      throw new NotFoundException('Transfer bulunamadı.');
    }

    return transfer;
  }

  async update(id: string, dto: UpdateTransferDto) {
    const current = await this.findOne(id);

    if (current.status === TransferStatus.COMPLETED) {
      throw new BadRequestException(
        'Tamamlanmış transfer düzenlenemez. Stok hareketi oluştuğu için kayıt kilitlidir.',
      );
    }

    if (
      dto.fromWarehouseId &&
      dto.toWarehouseId &&
      dto.fromWarehouseId === dto.toWarehouseId
    ) {
      throw new BadRequestException('Kaynak depo ile hedef depo aynı olamaz.');
    }

    if (dto.code && dto.code !== current.code) {
      const codeExists = await this.prisma.transfer.findUnique({
        where: { code: dto.code },
      });

      if (codeExists) {
        throw new ConflictException('Bu transfer kodu zaten kullanılıyor.');
      }
    }

    const nextFromWarehouseId = dto.fromWarehouseId ?? current.fromWarehouseId;
    const nextToWarehouseId = dto.toWarehouseId ?? current.toWarehouseId;

    if (nextFromWarehouseId === nextToWarehouseId) {
      throw new BadRequestException('Kaynak depo ile hedef depo aynı olamaz.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.transfer.update({
        where: { id },
        data: {
          code: dto.code,
          productId: dto.productId,
          fromWarehouseId: dto.fromWarehouseId,
          toWarehouseId: dto.toWarehouseId,
          quantity: dto.quantity,
          unit: dto.unit,
          status: dto.status,
          fromLocation: dto.fromLocation,
          toLocation: dto.toLocation,
          responsible: dto.responsible,
          documentNo: dto.documentNo,
          transferDate: dto.transferDate
            ? new Date(dto.transferDate)
            : undefined,
          note: dto.note,
          cancelledAt:
            dto.status === TransferStatus.CANCELLED ? new Date() : undefined,
        },
      });

      if (dto.status === TransferStatus.COMPLETED) {
        await this.applyTransferStock(tx, updated.id);
      }

      return tx.transfer.findUnique({
        where: { id },
        include: this.defaultInclude(),
      });
    });
  }

  async remove(id: string) {
    const transfer = await this.findOne(id);

    if (transfer.status === TransferStatus.COMPLETED) {
      throw new BadRequestException(
        'Tamamlanmış transfer silinemez. Stok hareketleri oluştuğu için kayıt korunmalıdır.',
      );
    }

    return this.prisma.transfer.delete({
      where: { id },
    });
  }

  private async generateCode() {
    const year = new Date().getFullYear();

    const count = await this.prisma.transfer.count({
      where: {
        code: {
          startsWith: `TRF-${year}-`,
        },
      },
    });

    return `TRF-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private defaultInclude() {
    return {
      product: true,
      fromWarehouse: true,
      toWarehouse: true,
    };
  }

  private async applyTransferStock(tx: any, transferId: string) {
    const transfer = await tx.transfer.findUnique({
      where: { id: transferId },
      include: {
        product: true,
        fromWarehouse: true,
        toWarehouse: true,
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer bulunamadı.');
    }

    const fromStock = await tx.warehouseStock.findUnique({
      where: {
        productId_warehouseId: {
          productId: transfer.productId,
          warehouseId: transfer.fromWarehouseId,
        },
      },
    });

    if (!fromStock) {
      throw new BadRequestException(
        'Kaynak depoda bu ürüne ait stok bulunmuyor.',
      );
    }

    if (fromStock.quantity < transfer.quantity) {
      throw new BadRequestException(
        `Yetersiz stok. Kaynak depodaki mevcut stok: ${fromStock.quantity}`,
      );
    }

    const toStock = await tx.warehouseStock.findUnique({
      where: {
        productId_warehouseId: {
          productId: transfer.productId,
          warehouseId: transfer.toWarehouseId,
        },
      },
    });

    const fromPreviousQuantity = fromStock.quantity;
    const fromNextQuantity = fromPreviousQuantity - transfer.quantity;

    await tx.warehouseStock.update({
      where: { id: fromStock.id },
      data: {
        quantity: fromNextQuantity,
      },
    });

    await tx.stockMovement.create({
      data: {
        type: StockMovementType.OUT,
        productId: transfer.productId,
        warehouseId: transfer.fromWarehouseId,
        quantity: transfer.quantity,
        previousQuantity: fromPreviousQuantity,
        nextQuantity: fromNextQuantity,
        documentNo: transfer.documentNo || transfer.code,
        responsible: transfer.responsible,
        location: transfer.fromLocation,
        note: `Transfer çıkışı: ${transfer.code}`,
      },
    });

    const toPreviousQuantity = toStock?.quantity ?? 0;
    const toNextQuantity = toPreviousQuantity + transfer.quantity;

    if (toStock) {
      await tx.warehouseStock.update({
        where: { id: toStock.id },
        data: {
          quantity: toNextQuantity,
          unit: transfer.unit,
          minStock: transfer.product.minStock,
        },
      });
    } else {
      await tx.warehouseStock.create({
        data: {
          productId: transfer.productId,
          warehouseId: transfer.toWarehouseId,
          quantity: toNextQuantity,
          unit: transfer.unit,
          minStock: transfer.product.minStock,
        },
      });
    }

    await tx.stockMovement.create({
      data: {
        type: StockMovementType.IN,
        productId: transfer.productId,
        warehouseId: transfer.toWarehouseId,
        quantity: transfer.quantity,
        previousQuantity: toPreviousQuantity,
        nextQuantity: toNextQuantity,
        documentNo: transfer.documentNo || transfer.code,
        responsible: transfer.responsible,
        location: transfer.toLocation,
        note: `Transfer girişi: ${transfer.code}`,
      },
    });

    await tx.transfer.update({
      where: { id: transfer.id },
      data: {
        status: TransferStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }
}
