import { Controller, Get, Query } from '@nestjs/common';
import {
  type CalendarDayDto,
  calendarDateSchema,
  type EmployeeMenuDto,
  type EmployeeSearchItemDto,
  type OrderingContextDto,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import { RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { OrderingService } from './ordering.service';

const employeeQuery = z.object({ employeeId: uuidSchema });
const calendarQuery = employeeQuery.extend({ from: calendarDateSchema.optional(), to: calendarDateSchema.optional() });
const searchQuery = z.object({ q: z.string().trim().max(100).default('') });

/** Read models for the order form; only staff who can create orders need them. */
@Controller('ordering')
export class OrderingController {
  constructor(private readonly ordering: OrderingService) {}

  @Get('employees')
  @RequirePermissions('orders.write')
  employees(@Query(new ZodValidationPipe(searchQuery)) query: z.infer<typeof searchQuery>): Promise<EmployeeSearchItemDto[]> {
    return this.ordering.searchEmployees(query.q);
  }

  @Get('context')
  @RequirePermissions('orders.write')
  context(@Query(new ZodValidationPipe(employeeQuery)) query: z.infer<typeof employeeQuery>): Promise<OrderingContextDto> {
    return this.ordering.context(query.employeeId);
  }

  @Get('calendar')
  @RequirePermissions('orders.write')
  calendar(@Query(new ZodValidationPipe(calendarQuery)) query: z.infer<typeof calendarQuery>): Promise<CalendarDayDto[]> {
    return this.ordering.calendar(query.employeeId, query.from, query.to);
  }

  @Get('menu')
  @RequirePermissions('orders.write')
  menu(@Query(new ZodValidationPipe(employeeQuery)) query: z.infer<typeof employeeQuery>): Promise<EmployeeMenuDto> {
    return this.ordering.menuForEmployee(query.employeeId);
  }
}
