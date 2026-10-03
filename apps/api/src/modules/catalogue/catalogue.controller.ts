import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  categoryInputSchema,
  type DishDetailDto,
  dishInputSchema,
  type DishListItemDto,
  dishListQuerySchema,
  type EmployeeMenuDto,
  type MenuAdminCategoryDto,
  menuItemCreateSchema,
  menuItemUpdateSchema,
  type OptionDto,
  optionGroupsInputSchema,
  optionInputSchema,
  type Paginated,
  type PriceTierDto,
  priceSetSchema,
  REFERENCE_KINDS,
  referenceCreateSchema,
  type ReferenceItemDto,
  type ReferenceKind,
  referenceUpdateSchema,
  reorderSchema,
  type TierGridDto,
  tierInputSchema,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CatalogueService } from './catalogue.service';
import { MenuAdminService } from './menu-admin.service';
import { PricingService } from './pricing.service';
import { ReferenceService } from './reference.service';

const idParam = new ZodValidationPipe(uuidSchema);
const kindParam = new ZodValidationPipe(z.enum(REFERENCE_KINDS));
const pipe = <T extends z.ZodType>(schema: T) => new ZodValidationPipe(schema);

/** Reference data, options, dishes (TRD §6.2–§6.3). */
@Controller()
export class CatalogueController {
  constructor(
    private readonly reference: ReferenceService,
    private readonly catalogue: CatalogueService,
  ) {}

  @Get('reference/:kind')
  @RequirePermissions('reference.read')
  referenceList(@Param('kind', kindParam) kind: ReferenceKind): Promise<ReferenceItemDto[]> {
    return this.reference.list(kind);
  }

  @Post('reference/:kind')
  @RequirePermissions('reference.manage')
  referenceCreate(@Param('kind', kindParam) kind: ReferenceKind, @Body(pipe(referenceCreateSchema)) body: z.infer<typeof referenceCreateSchema>) {
    return this.reference.create(kind, body);
  }

  @Put('reference/:kind/order')
  @RequirePermissions('reference.manage')
  referenceReorder(@Param('kind', kindParam) kind: ReferenceKind, @Body(pipe(reorderSchema)) body: z.infer<typeof reorderSchema>) {
    return this.reference.reorder(kind, body.ids);
  }

  @Patch('reference/:kind/:id')
  @RequirePermissions('reference.manage')
  referenceUpdate(
    @Param('kind', kindParam) kind: ReferenceKind,
    @Param('id', idParam) id: string,
    @Body(pipe(referenceUpdateSchema)) body: z.infer<typeof referenceUpdateSchema>,
  ) {
    return this.reference.update(kind, id, body);
  }

  @Get('options')
  @RequirePermissions('catalogue.read')
  options(): Promise<OptionDto[]> {
    return this.catalogue.options();
  }

  @Post('options')
  @RequirePermissions('catalogue.manage')
  createOption(@Body(pipe(optionInputSchema)) body: z.infer<typeof optionInputSchema>): Promise<OptionDto> {
    return this.catalogue.createOption(body);
  }

  @Put('options/:id')
  @RequirePermissions('catalogue.manage')
  updateOption(@Param('id', idParam) id: string, @Body(pipe(optionInputSchema)) body: z.infer<typeof optionInputSchema>): Promise<OptionDto> {
    return this.catalogue.updateOption(id, body);
  }

  @Get('dishes')
  @RequirePermissions('catalogue.read')
  dishes(@Query(pipe(dishListQuerySchema)) q: z.infer<typeof dishListQuerySchema>): Promise<Paginated<DishListItemDto>> {
    return this.catalogue.dishes(q);
  }

  @Get('dishes/:id')
  @RequirePermissions('catalogue.read')
  dish(@Param('id', idParam) id: string): Promise<DishDetailDto> {
    return this.catalogue.dish(id);
  }

  @Post('dishes')
  @RequirePermissions('catalogue.manage')
  createDish(@Body(pipe(dishInputSchema)) body: z.infer<typeof dishInputSchema>): Promise<DishDetailDto> {
    return this.catalogue.createDish(body);
  }

  @Put('dishes/:id')
  @RequirePermissions('catalogue.manage')
  updateDish(@Param('id', idParam) id: string, @Body(pipe(dishInputSchema)) body: z.infer<typeof dishInputSchema>): Promise<DishDetailDto> {
    return this.catalogue.updateDish(id, body);
  }

  @Put('dishes/:id/option-groups')
  @RequirePermissions('catalogue.manage')
  setGroups(@Param('id', idParam) id: string, @Body(pipe(optionGroupsInputSchema)) body: z.infer<typeof optionGroupsInputSchema>): Promise<DishDetailDto> {
    return this.catalogue.setOptionGroups(id, body);
  }
}

/** Price tiers and the tier grid (TRD §6.4). */
@Controller('price-tiers')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions('pricing.read')
  tiers(): Promise<PriceTierDto[]> {
    return this.pricing.tiers();
  }

  @Post()
  @RequirePermissions('pricing.manage')
  create(@Body(pipe(tierInputSchema)) body: z.infer<typeof tierInputSchema>): Promise<PriceTierDto> {
    return this.pricing.createTier(body);
  }

  @Put(':id')
  @RequirePermissions('pricing.manage')
  update(@Param('id', idParam) id: string, @Body(pipe(tierInputSchema)) body: z.infer<typeof tierInputSchema>): Promise<PriceTierDto> {
    return this.pricing.updateTier(id, body);
  }

  @Post(':id/make-default')
  @HttpCode(200)
  @RequirePermissions('pricing.manage')
  makeDefault(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<PriceTierDto[]> {
    return this.pricing.makeDefault(id, user);
  }

  @Get(':id/grid')
  @RequirePermissions('pricing.read')
  grid(@Param('id', idParam) id: string, @Query(pipe(z.object({ kind: z.enum(['dishes', 'options']).default('dishes') }))) q: { kind: 'dishes' | 'options' }): Promise<TierGridDto> {
    return this.pricing.grid(id, q.kind);
  }

  @Put(':id/prices')
  @RequirePermissions('pricing.manage')
  setPrice(@Param('id', idParam) id: string, @Body(pipe(priceSetSchema)) body: z.infer<typeof priceSetSchema>): Promise<TierGridDto> {
    return this.pricing.setPrice(id, body);
  }
}

/** Menu categories, placements and the employee preview (TRD §6.5). */
@Controller('menu')
export class MenuAdminController {
  constructor(private readonly menu: MenuAdminService) {}

  @Get('categories')
  @RequirePermissions('menu.read')
  categories(): Promise<MenuAdminCategoryDto[]> {
    return this.menu.categories();
  }

  @Post('categories')
  @RequirePermissions('menu.manage')
  create(@Body(pipe(categoryInputSchema)) body: z.infer<typeof categoryInputSchema>) {
    return this.menu.createCategory(body);
  }

  @Put('categories/order')
  @RequirePermissions('menu.manage')
  reorder(@Body(pipe(reorderSchema)) body: z.infer<typeof reorderSchema>) {
    return this.menu.reorderCategories(body.ids);
  }

  @Put('categories/:id')
  @RequirePermissions('menu.manage')
  update(@Param('id', idParam) id: string, @Body(pipe(categoryInputSchema)) body: z.infer<typeof categoryInputSchema>) {
    return this.menu.updateCategory(id, body);
  }

  @Post('categories/:id/items')
  @RequirePermissions('menu.manage')
  addItem(@Param('id', idParam) id: string, @Body(pipe(menuItemCreateSchema)) body: z.infer<typeof menuItemCreateSchema>) {
    return this.menu.addItem(id, body.dishId);
  }

  @Put('categories/:id/items/order')
  @RequirePermissions('menu.manage')
  reorderItems(@Param('id', idParam) id: string, @Body(pipe(reorderSchema)) body: z.infer<typeof reorderSchema>) {
    return this.menu.reorderItems(id, body.ids);
  }

  @Patch('items/:id')
  @RequirePermissions('menu.manage')
  updateItem(@Param('id', idParam) id: string, @Body(pipe(menuItemUpdateSchema)) body: z.infer<typeof menuItemUpdateSchema>) {
    return this.menu.updateItem(id, body.isActive);
  }

  @Delete('items/:id')
  @RequirePermissions('menu.manage')
  removeItem(@Param('id', idParam) id: string) {
    return this.menu.removeItem(id);
  }

  /** The menu exactly as one employee sees it, with excluded items and why (MENU-04, PRICE-05). */
  @Get('preview')
  @RequirePermissions('menu.read')
  preview(@Query(pipe(z.object({ employeeId: uuidSchema }))) q: { employeeId: string }): Promise<EmployeeMenuDto> {
    return this.menu.preview(q.employeeId);
  }
}
