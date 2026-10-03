import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  type BillableQuery,
  billableQuerySchema,
  type BillingCompanyDto,
  type CompanyBillableDto,
  type CreateAdjustmentInput,
  createAdjustmentSchema,
  type CreateInvoiceInput,
  createInvoiceSchema,
  type InvoiceDetailDto,
  type InvoiceListItemDto,
  type InvoiceListQuery,
  invoiceListQuerySchema,
  type MarkPaidInput,
  markPaidSchema,
  type Paginated,
  uuidSchema,
} from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { BillingService } from './billing.service';

const idParam = new ZodValidationPipe(uuidSchema);

/** Company billing (TRD §6.14). */
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/companies')
  @RequirePermissions('billing.read')
  companies(): Promise<BillingCompanyDto[]> {
    return this.billing.companies();
  }

  @Get('billing/companies/:id/billable')
  @RequirePermissions('billing.read')
  billable(@Param('id', idParam) id: string, @Query(new ZodValidationPipe(billableQuerySchema)) q: BillableQuery): Promise<CompanyBillableDto> {
    return this.billing.billable(id, q);
  }

  @Get('billing/invoices')
  @RequirePermissions('billing.read')
  invoices(@Query(new ZodValidationPipe(invoiceListQuerySchema)) q: InvoiceListQuery): Promise<Paginated<InvoiceListItemDto>> {
    return this.billing.invoices(q);
  }

  @Get('billing/invoices/:id')
  @RequirePermissions('billing.read')
  invoice(@Param('id', idParam) id: string): Promise<InvoiceDetailDto> {
    return this.billing.invoice(id);
  }

  @Post('billing/invoices')
  @RequirePermissions('billing.manage')
  create(@Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput, @CurrentUser() user: AuthUser): Promise<InvoiceDetailDto> {
    return this.billing.createInvoice(body, user);
  }

  @Post('billing/invoices/:id/mark-paid')
  @HttpCode(200)
  @RequirePermissions('billing.manage')
  markPaid(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(markPaidSchema)) body: MarkPaidInput,
    @CurrentUser() user: AuthUser,
  ): Promise<InvoiceDetailDto> {
    return this.billing.markPaid(id, body, user);
  }

  @Post('orders/:id/adjustments')
  @RequirePermissions('billing.manage')
  async addAdjustment(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(createAdjustmentSchema)) body: CreateAdjustmentInput,
    @CurrentUser() user: AuthUser,
  ): Promise<{ orderId: string }> {
    await this.billing.addAdjustment(id, body, user);
    return { orderId: id };
  }
}
