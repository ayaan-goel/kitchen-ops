import { Injectable } from '@nestjs/common';
import type { ReferenceItemDto, ReferenceKind } from '@fernleaf/shared';
import { NotFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { uniqueName } from './unique';

interface Row {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
  usage: number;
}

interface KindOps {
  list(): Promise<Row[]>;
  create(data: { name: string; description?: string; sortOrder: number }): Promise<unknown>;
  update(id: string, data: { name?: string; description?: string; isActive?: boolean; sortOrder?: number }): Promise<unknown>;
  exists(id: string): Promise<boolean>;
}

/**
 * The five reference lists behind one generic API (CAT-06, A-21). Rows are never deleted: other
 * records point at them, so they are deactivated instead (hidden from pickers, kept on history).
 */
@Injectable()
export class ReferenceService {
  private readonly ops: Record<ReferenceKind, KindOps>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: MenuCatalogueService,
  ) {
    const p = this.prisma;
    const order = { orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }] };
    this.ops = {
      allergens: {
        list: async () =>
          (await p.allergen.findMany({ ...order, include: { _count: { select: { dishes: true, options: true, employees: true } } } })).map(
            ({ _count: c, ...r }) => ({ ...r, usage: c.dishes + c.options + c.employees }),
          ),
        create: (d) => p.allergen.create({ data: { name: d.name, sortOrder: d.sortOrder } }),
        update: (id, d) => p.allergen.update({ where: { id }, data: { name: d.name, isActive: d.isActive, sortOrder: d.sortOrder } }),
        exists: async (id) => !!(await p.allergen.findUnique({ where: { id }, select: { id: true } })),
      },
      'dietary-tags': {
        list: async () =>
          (await p.dietaryTag.findMany({ ...order, include: { _count: { select: { dishes: true, options: true, employees: true } } } })).map(
            ({ _count: c, ...r }) => ({ ...r, usage: c.dishes + c.options + c.employees }),
          ),
        create: (d) => p.dietaryTag.create({ data: { name: d.name, sortOrder: d.sortOrder } }),
        update: (id, d) => p.dietaryTag.update({ where: { id }, data: { name: d.name, isActive: d.isActive, sortOrder: d.sortOrder } }),
        exists: async (id) => !!(await p.dietaryTag.findUnique({ where: { id }, select: { id: true } })),
      },
      stations: {
        list: async () =>
          (await p.kitchenStation.findMany({ ...order, include: { _count: { select: { dishes: true } } } })).map(({ _count: c, ...r }) => ({ ...r, usage: c.dishes })),
        create: (d) => p.kitchenStation.create({ data: { name: d.name, sortOrder: d.sortOrder } }),
        update: (id, d) => p.kitchenStation.update({ where: { id }, data: { name: d.name, isActive: d.isActive, sortOrder: d.sortOrder } }),
        exists: async (id) => !!(await p.kitchenStation.findUnique({ where: { id }, select: { id: true } })),
      },
      'portion-sizes': {
        list: async () =>
          (await p.portionSize.findMany({ ...order, include: { _count: { select: { groupSizes: true, optionPortions: true } } } })).map(
            ({ _count: c, ...r }) => ({ ...r, usage: c.groupSizes + c.optionPortions }),
          ),
        create: (d) => p.portionSize.create({ data: { name: d.name, sortOrder: d.sortOrder } }),
        update: (id, d) => p.portionSize.update({ where: { id }, data: { name: d.name, isActive: d.isActive, sortOrder: d.sortOrder } }),
        exists: async (id) => !!(await p.portionSize.findUnique({ where: { id }, select: { id: true } })),
      },
      'packaging-types': {
        list: async () =>
          (await p.packagingType.findMany({ ...order, include: { _count: { select: { companies: true, orders: true } } } })).map(
            ({ _count: c, ...r }) => ({ ...r, usage: c.companies + c.orders }),
          ),
        create: (d) => p.packagingType.create({ data: { name: d.name, description: d.description ?? '', sortOrder: d.sortOrder } }),
        update: (id, d) =>
          p.packagingType.update({ where: { id }, data: { name: d.name, description: d.description, isActive: d.isActive, sortOrder: d.sortOrder } }),
        exists: async (id) => !!(await p.packagingType.findUnique({ where: { id }, select: { id: true } })),
      },
    };
  }

  list(kind: ReferenceKind): Promise<ReferenceItemDto[]> {
    return this.ops[kind].list();
  }

  async create(kind: ReferenceKind, input: { name: string; description?: string }): Promise<ReferenceItemDto[]> {
    const rows = await this.ops[kind].list();
    await uniqueName(() => this.ops[kind].create({ ...input, sortOrder: rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0 }), input.name);
    this.catalogue.invalidate();
    return this.list(kind);
  }

  async update(kind: ReferenceKind, id: string, input: { name?: string; description?: string; isActive?: boolean }): Promise<ReferenceItemDto[]> {
    if (!(await this.ops[kind].exists(id))) throw new NotFound();
    await uniqueName(() => this.ops[kind].update(id, input), input.name ?? '');
    this.catalogue.invalidate();
    return this.list(kind);
  }

  async reorder(kind: ReferenceKind, ids: string[]): Promise<ReferenceItemDto[]> {
    // Sort order is cosmetic; a half-applied reorder is harmless and fixed by the next one.
    await Promise.all(ids.map((id, i) => this.ops[kind].update(id, { sortOrder: i })));
    this.catalogue.invalidate();
    return this.list(kind);
  }
}
