import { Injectable } from '@nestjs/common';
import type { CategoryInput, EmployeeMenuDto, MenuAdminCategoryDto } from '@fernleaf/shared';
import { NotFound, RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MenuCatalogueService } from '../ordering/menu-catalogue.service';
import { uniqueName } from './unique';

/**
 * Menu categories and placements (MENU-01, MENU-03) and the employee-eye preview (MENU-04).
 * The preview goes through the same `MenuCatalogueService` that validates and prices orders, so
 * what admins see is exactly what an employee can order.
 */
@Injectable()
export class MenuAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: MenuCatalogueService,
  ) {}

  async categories(): Promise<MenuAdminCategoryDto[]> {
    const rows = await this.prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { hiddenFor: true } },
        items: { orderBy: { sortOrder: 'asc' }, include: { dish: { select: { name: true, sku: true, isActive: true } } } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      isSecret: c.isSecret,
      hiddenForCompanies: c._count.hiddenFor,
      items: c.items.map((i) => ({ id: i.id, dishId: i.dishId, dishName: i.dish.name, sku: i.dish.sku, dishActive: i.dish.isActive, isActive: i.isActive, sortOrder: i.sortOrder })),
    }));
  }

  async createCategory(input: Required<CategoryInput>): Promise<MenuAdminCategoryDto[]> {
    const last = await this.prisma.menuCategory.aggregate({ _max: { sortOrder: true } });
    await uniqueName(() => this.prisma.menuCategory.create({ data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 } }), input.slug, 'slug');
    return this.changed();
  }

  async updateCategory(id: string, input: Required<CategoryInput>): Promise<MenuAdminCategoryDto[]> {
    await this.mustExist(id);
    await uniqueName(() => this.prisma.menuCategory.update({ where: { id }, data: input }), input.slug, 'slug');
    return this.changed();
  }

  async reorderCategories(ids: string[]): Promise<MenuAdminCategoryDto[]> {
    await Promise.all(ids.map((id, sortOrder) => this.prisma.menuCategory.updateMany({ where: { id }, data: { sortOrder } })));
    return this.changed();
  }

  async addItem(categoryId: string, dishId: string): Promise<MenuAdminCategoryDto[]> {
    await this.mustExist(categoryId);
    if (!(await this.prisma.dish.findUnique({ where: { id: dishId }, select: { id: true } }))) throw new NotFound('Dish not found');
    const last = await this.prisma.menuItem.aggregate({ where: { categoryId }, _max: { sortOrder: true } });
    try {
      await this.prisma.menuItem.create({ data: { categoryId, dishId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'P2002') {
        throw new RuleViolation('VALIDATION_FAILED', 'That dish is already in this category.', [{ path: ['dishId'], code: 'VALIDATION_FAILED', message: 'Already in this category' }]);
      }
      throw err;
    }
    return this.changed();
  }

  async updateItem(id: string, isActive: boolean): Promise<MenuAdminCategoryDto[]> {
    const updated = await this.prisma.menuItem.updateMany({ where: { id }, data: { isActive } });
    if (updated.count === 0) throw new NotFound('Menu item not found');
    return this.changed();
  }

  /** Removes the placement only; the dish and past orders are untouched. */
  async removeItem(id: string): Promise<MenuAdminCategoryDto[]> {
    const removed = await this.prisma.menuItem.deleteMany({ where: { id } });
    if (removed.count === 0) throw new NotFound('Menu item not found');
    return this.changed();
  }

  async reorderItems(categoryId: string, ids: string[]): Promise<MenuAdminCategoryDto[]> {
    await Promise.all(ids.map((id, sortOrder) => this.prisma.menuItem.updateMany({ where: { id, categoryId }, data: { sortOrder } })));
    return this.changed();
  }

  async preview(employeeId: string): Promise<EmployeeMenuDto & { employee: { id: string; name: string; company: string } }> {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true, companyId: true, company: { select: { name: true } } } });
    if (!employee) throw new NotFound('Employee not found');
    const menu = this.catalogue.toDto(await this.catalogue.forCompany(employee.companyId));
    return { ...menu, employee: { id: employee.id, name: employee.name, company: employee.company.name } };
  }

  private async mustExist(id: string): Promise<void> {
    if (!(await this.prisma.menuCategory.findUnique({ where: { id }, select: { id: true } }))) throw new NotFound('Category not found');
  }

  private changed(): Promise<MenuAdminCategoryDto[]> {
    this.catalogue.invalidate();
    return this.categories();
  }
}
