import { Injectable } from '@nestjs/common';
import { validateGroupConfig } from '@fernleaf/domain';
import type {
  DishDetailDto,
  DishInputParsed,
  DishListItemDto,
  DishListQuery,
  OptionDto,
  OptionGroupsInput,
  OptionInput,
  Paginated,
} from '@fernleaf/shared';
import { NotFound, RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { uniqueName } from './unique';

const OPTION_INCLUDE = {
  allergens: { select: { allergenId: true } },
  dietaryTags: { select: { dietaryTagId: true } },
  portions: { select: { portionSizeId: true, extraCents: true } },
  groupItems: { select: { group: { select: { dishId: true } } } },
} satisfies Prisma.OptionInclude;

const DISH_DETAIL_INCLUDE = {
  allergens: { select: { allergenId: true } },
  dietaryTags: { select: { dietaryTagId: true } },
  optionGroups: {
    orderBy: { sortOrder: 'asc' },
    include: { items: { orderBy: { sortOrder: 'asc' } }, portionSizes: { orderBy: { sortOrder: 'asc' } } },
  },
  menuItems: { select: { category: { select: { id: true, name: true } } } },
} satisfies Prisma.DishInclude;

/**
 * Options and dishes (CAT-01…05). Dishes are deactivated, never deleted (CAT-02): orders keep
 * snapshots, so editing the catalogue never changes an existing order. Every write invalidates
 * the cached menu so the next quote/preview sees it.
 */
@Injectable()
export class CatalogueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  // ─── options ───

  async options(): Promise<OptionDto[]> {
    const rows = await this.prisma.option.findMany({ include: OPTION_INCLUDE, orderBy: { name: 'asc' } });
    return rows.map((o) => this.optionDto(o));
  }

  async createOption(input: OptionInput): Promise<OptionDto> {
    const row = await uniqueName(
      () =>
        this.prisma.option.create({
          data: {
            name: input.name,
            description: input.description,
            costCents: input.costCents,
            isActive: input.isActive,
            allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
            dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
            portions: { create: this.uniquePortions(input.portions) },
          },
          include: OPTION_INCLUDE,
        }),
      input.name,
    );
    this.catalogue.invalidate();
    return this.optionDto(row);
  }

  async updateOption(id: string, input: OptionInput): Promise<OptionDto> {
    const existing = await this.prisma.option.findUnique({ where: { id }, include: { groupItems: { include: { group: true } } } });
    if (!existing) throw new NotFound('Option not found');
    // Removing a size the option is sold in would break portion groups that use it (BR-07).
    const kept = new Set(input.portions.map((p) => p.portionSizeId));
    const broken = existing.groupItems.filter((gi) => gi.group.usesPortions);
    if (broken.length > 0) {
      const sizes = await this.prisma.optionGroupPortionSize.findMany({
        where: { groupId: { in: broken.map((b) => b.groupId) } },
        include: { portionSize: true, group: { include: { dish: { select: { name: true } } } } },
      });
      const lost = sizes.filter((s) => !kept.has(s.portionSizeId));
      if (lost.length > 0) {
        const first = lost[0]!;
        const message = `“${first.group.dish.name}” sells this option in ${first.portionSize.name} (group “${first.group.name}”). Remove it from that group first.`;
        throw new RuleViolation('PORTION_INVALID', message, [{ path: ['portions'], code: 'PORTION_INVALID', message }]);
      }
    }
    const row = await uniqueName(
      () =>
        this.prisma.$transaction(async (tx) => {
          await tx.optionAllergen.deleteMany({ where: { optionId: id } });
          await tx.optionDietaryTag.deleteMany({ where: { optionId: id } });
          await tx.optionPortion.deleteMany({ where: { optionId: id } });
          return tx.option.update({
            where: { id },
            data: {
              name: input.name,
              description: input.description,
              costCents: input.costCents,
              isActive: input.isActive,
              allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
              dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
              portions: { create: this.uniquePortions(input.portions) },
            },
            include: OPTION_INCLUDE,
          });
        }),
      input.name,
    );
    this.catalogue.invalidate();
    return this.optionDto(row);
  }

  // ─── dishes ───

  async dishes(q: DishListQuery): Promise<Paginated<DishListItemDto>> {
    const where: Prisma.DishWhereInput = {
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }] } : {}),
      ...(q.stationId === 'none' ? { stationId: null } : q.stationId ? { stationId: q.stationId } : {}),
      ...(q.active ? { isActive: q.active === 'true' } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.dish.findMany({
        where,
        include: { station: { select: { name: true } }, _count: { select: { optionGroups: true, menuItems: true } } },
        orderBy: [{ isActive: 'desc' }, { sku: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.dish.count({ where }),
    ]);
    return {
      items: rows.map((d) => ({
        id: d.id,
        sku: d.sku,
        name: d.name,
        temperature: d.temperature,
        costCents: d.costCents,
        stationName: d.station?.name ?? null,
        isActive: d.isActive,
        imageUrl: d.imageUrl,
        groupCount: d._count.optionGroups,
        menuPlacements: d._count.menuItems,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
    };
  }

  async dish(id: string): Promise<DishDetailDto> {
    const d = await this.prisma.dish.findUnique({ where: { id }, include: DISH_DETAIL_INCLUDE });
    if (!d) throw new NotFound('Dish not found');
    return {
      id: d.id,
      sku: d.sku,
      name: d.name,
      description: d.description,
      imageUrl: d.imageUrl,
      temperature: d.temperature,
      costCents: d.costCents,
      stationId: d.stationId,
      minOrderQty: d.minOrderQty,
      isActive: d.isActive,
      allergenIds: d.allergens.map((a) => a.allergenId),
      dietaryTagIds: d.dietaryTags.map((t) => t.dietaryTagId),
      groups: d.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        isRequired: g.isRequired,
        maxSelections: g.maxSelections,
        usesPortions: g.usesPortions,
        optionIds: g.items.map((i) => i.optionId),
        portionSizeIds: g.portionSizes.map((s) => s.portionSizeId),
      })),
      menuCategories: d.menuItems.map((m) => m.category),
    };
  }

  async createDish(input: DishInputParsed): Promise<DishDetailDto> {
    const row = await uniqueName(
      () =>
        this.prisma.dish.create({
          data: {
            ...this.dishScalars(input),
            allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
            dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
          },
        }),
      input.sku,
      'sku',
    );
    this.catalogue.invalidate();
    return this.dish(row.id);
  }

  async updateDish(id: string, input: DishInputParsed): Promise<DishDetailDto> {
    if (!(await this.prisma.dish.findUnique({ where: { id }, select: { id: true } }))) throw new NotFound('Dish not found');
    await uniqueName(
      () =>
        this.prisma.$transaction(async (tx) => {
          await tx.dishAllergen.deleteMany({ where: { dishId: id } });
          await tx.dishDietaryTag.deleteMany({ where: { dishId: id } });
          await tx.dish.update({
            where: { id },
            data: {
              ...this.dishScalars(input),
              allergens: { create: input.allergenIds.map((allergenId) => ({ allergenId })) },
              dietaryTags: { create: input.dietaryTagIds.map((dietaryTagId) => ({ dietaryTagId })) },
            },
          });
        }),
      input.sku,
      'sku',
    );
    this.catalogue.invalidate();
    return this.dish(id);
  }

  /**
   * Replaces a dish's option groups (CAT-04). Diffed by id: kept groups are updated in place, so
   * past order selections keep pointing at them; removed groups are deleted (past selections keep
   * their name/price snapshots and lose only the link).
   */
  async setOptionGroups(dishId: string, input: OptionGroupsInput): Promise<DishDetailDto> {
    const groups = input.groups.map((g) => ({ ...g, portionSizeIds: g.portionSizeIds ?? [] }));
    const existing = await this.prisma.optionGroup.findMany({ where: { dishId }, select: { id: true } });
    if (!(await this.prisma.dish.findUnique({ where: { id: dishId }, select: { id: true } }))) throw new NotFound('Dish not found');
    const existingIds = new Set(existing.map((g) => g.id));
    groups.forEach((g, i) => {
      if (g.id && !existingIds.has(g.id)) throw new RuleViolation('VALIDATION_FAILED', 'A group belongs to another dish.', [{ path: ['groups', i, 'id'], code: 'VALIDATION_FAILED', message: 'Unknown group' }]);
    });

    const optionIds = [...new Set(groups.flatMap((g) => g.optionIds))];
    const sizeIds = [...new Set(groups.flatMap((g) => g.portionSizeIds))];
    const [options, sizes] = await Promise.all([
      this.prisma.option.findMany({ where: { id: { in: optionIds } }, include: { portions: { select: { portionSizeId: true } } } }),
      this.prisma.portionSize.findMany({ where: { id: { in: sizeIds } } }),
    ]);
    const optionById = new Map(options.map((o) => [o.id, o]));
    const sizeById = new Map(sizes.map((s) => [s.id, s]));
    const issues = validateGroupConfig(groups, {
      optionName: (id) => optionById.get(id)?.name,
      sizeName: (id) => sizeById.get(id)?.name,
      optionSizes: (id) => new Set(optionById.get(id)?.portions.map((p) => p.portionSizeId) ?? []),
    });
    if (issues.length > 0) {
      throw new RuleViolation(issues[0]!.code, issues.length === 1 ? issues[0]!.message : `${issues.length} problems in the option groups.`, issues);
    }

    await this.prisma.$transaction(async (tx) => {
      const keep = new Set(groups.map((g) => g.id).filter((x): x is string => !!x));
      await tx.optionGroup.deleteMany({ where: { dishId, id: { notIn: [...keep] } } });
      // Temporary names avoid clashing with the (dishId, name) unique while groups swap names.
      for (const id of keep) await tx.optionGroup.update({ where: { id }, data: { name: `__tmp_${id}` } });
      for (const [i, g] of groups.entries()) {
        const data = { name: g.name.trim(), isRequired: g.isRequired, maxSelections: g.maxSelections, usesPortions: g.usesPortions, sortOrder: i };
        const group = g.id ? await tx.optionGroup.update({ where: { id: g.id }, data }) : await tx.optionGroup.create({ data: { ...data, dishId } });
        await tx.optionGroupItem.deleteMany({ where: { groupId: group.id } });
        await tx.optionGroupPortionSize.deleteMany({ where: { groupId: group.id } });
        await tx.optionGroupItem.createMany({ data: g.optionIds.map((optionId, sortOrder) => ({ groupId: group.id, optionId, sortOrder })) });
        if (g.usesPortions) {
          await tx.optionGroupPortionSize.createMany({ data: g.portionSizeIds.map((portionSizeId, sortOrder) => ({ groupId: group.id, portionSizeId, sortOrder })) });
        }
      }
    });
    this.catalogue.invalidate();
    return this.dish(dishId);
  }

  private dishScalars(input: DishInputParsed) {
    return {
      sku: input.sku,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      temperature: input.temperature,
      costCents: input.costCents,
      stationId: input.stationId,
      minOrderQty: input.minOrderQty,
      isActive: input.isActive,
    };
  }

  private uniquePortions(portions: OptionInput['portions']) {
    return [...new Map(portions.map((p) => [p.portionSizeId, p])).values()];
  }

  private optionDto(o: Prisma.OptionGetPayload<{ include: typeof OPTION_INCLUDE }>): OptionDto {
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      costCents: o.costCents,
      isActive: o.isActive,
      allergenIds: o.allergens.map((a) => a.allergenId),
      dietaryTagIds: o.dietaryTags.map((t) => t.dietaryTagId),
      portions: o.portions,
      usedByDishes: new Set(o.groupItems.map((g) => g.group.dishId)).size,
    };
  }
}
