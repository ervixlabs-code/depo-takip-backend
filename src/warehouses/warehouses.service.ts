import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWarehouseDto) {
    const exists = await this.prisma.warehouse.findUnique({
      where: { code: dto.code },
    });

    if (exists) {
      throw new ConflictException('Bu depo kodu zaten kullanılıyor.');
    }

    return this.prisma.warehouse.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.warehouse.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        stocks: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: {
          include: {
            product: true,
          },
        },
        movements: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Depo bulunamadı.');
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    await this.findOne(id);

    if (dto.code) {
      const exists = await this.prisma.warehouse.findUnique({
        where: { code: dto.code },
      });

      if (exists && exists.id !== id) {
        throw new ConflictException(
          'Bu depo kodu başka bir depoda kullanılıyor.',
        );
      }
    }

    return this.prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.warehouse.delete({
      where: { id },
    });
  }
}
