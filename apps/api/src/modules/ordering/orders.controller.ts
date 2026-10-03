import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  type CreateOrderInput,
  createOrderSchema,
  deliveryOverrideSchema,
  type OrderDetailDto,
  type OrderInput,
  orderInputSchema,
  type OrderListItemDto,
  type OrderListQuery,
  orderListQuerySchema,
  type OrderWriteResultDto,
  type Paginated,
  type QuoteResponse,
  reasonSchema,
  type UpdateOrderInput,
  updateOrderSchema,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { OrdersService } from './orders.service';

const idParam = new ZodValidationPipe(uuidSchema);
const versionBody = z.object({ version: z.number().int().min(0) });

/**
 * Orders API. Permissions: read for list/detail; write for creating/editing before cut-off
 * (the service additionally requires `orders.override` after cut-off — A-07); override for
 * rejecting and for delivery overrides (ORD-08).
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  list(@Query(new ZodValidationPipe(orderListQuerySchema)) query: OrderListQuery): Promise<Paginated<OrderListItemDto>> {
    return this.orders.list(query);
  }

  @Post('quote')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  quote(@Body(new ZodValidationPipe(orderInputSchema)) body: OrderInput, @CurrentUser() user: AuthUser): Promise<QuoteResponse> {
    return this.orders.quote(body, user);
  }

  @Post()
  @RequirePermissions('orders.write')
  create(@Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput, @CurrentUser() user: AuthUser): Promise<OrderWriteResultDto> {
    return this.orders.create(body, user);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  detail(@Param('id', idParam) id: string): Promise<OrderDetailDto> {
    return this.orders.detail(id);
  }

  @Put(':id')
  @RequirePermissions('orders.write')
  update(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(updateOrderSchema)) body: UpdateOrderInput,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderWriteResultDto> {
    return this.orders.update(id, body, user);
  }

  @Post(':id/place')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  place(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(versionBody)) body: z.infer<typeof versionBody>,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderWriteResultDto> {
    return this.orders.place(id, body.version, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('orders.write')
  cancel(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetailDto> {
    return this.orders.cancel(id, body.reason, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('orders.override')
  reject(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetailDto> {
    return this.orders.reject(id, body.reason, user);
  }

  @Patch(':id/delivery')
  @RequirePermissions('orders.override')
  overrideDelivery(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(deliveryOverrideSchema)) body: z.infer<typeof deliveryOverrideSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<OrderDetailDto> {
    return this.orders.overrideDelivery(id, body, user);
  }
}
