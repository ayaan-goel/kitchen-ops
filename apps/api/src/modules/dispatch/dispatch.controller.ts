import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AssignableDriverDto,
  assignDriverSchema,
  type AssignDriverInput,
  calendarDateSchema,
  type DeliverDropInput,
  deliverDropSchema,
  type DispatchBoardDto,
  type DropDto,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ClockService } from '../../common/clock/clock.service';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { DispatchService } from './dispatch.service';

const dateQuery = z.object({ date: calendarDateSchema.optional() });
const idParam = new ZodValidationPipe(uuidSchema);

/** Dispatch board (TRD §6.11). */
@Controller('dispatch')
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly clock: ClockService,
  ) {}

  @Get('drops')
  @RequirePermissions('dispatch.read')
  board(@Query(new ZodValidationPipe(dateQuery)) q: z.infer<typeof dateQuery>): Promise<DispatchBoardDto> {
    return this.dispatch.board(q.date ?? this.clock.today());
  }

  @Get('drops/:id')
  @RequirePermissions('dispatch.read')
  drop(@Param('id', idParam) id: string): Promise<DropDto> {
    return this.dispatch.drop(id);
  }

  @Get('drivers')
  @RequirePermissions('dispatch.read')
  drivers(@Query(new ZodValidationPipe(dateQuery)) q: z.infer<typeof dateQuery>): Promise<AssignableDriverDto[]> {
    return this.dispatch.drivers(q.date ?? this.clock.today());
  }

  @Patch('drops/:id/driver')
  @RequirePermissions('dispatch.manage')
  assignDriver(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(assignDriverSchema)) body: AssignDriverInput,
    @CurrentUser() user: AuthUser,
  ): Promise<DropDto> {
    return this.dispatch.assignDriver(id, body.driverId, user);
  }

  @Post('drops/:id/dispatch-ready')
  @HttpCode(200)
  @RequirePermissions('dispatch.manage')
  dispatchReady(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<DropDto> {
    return this.dispatch.markDispatchReady(id, user);
  }

  @Post('drops/:id/out-for-delivery')
  @HttpCode(200)
  @RequirePermissions('dispatch.manage')
  outForDelivery(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<DropDto> {
    return this.dispatch.markOutForDelivery(id, user);
  }

  @Post('drops/:id/delivered')
  @HttpCode(200)
  @RequirePermissions('dispatch.manage')
  delivered(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(deliverDropSchema)) body: DeliverDropInput,
    @CurrentUser() user: AuthUser,
  ): Promise<DropDto> {
    return this.dispatch.deliver(id, body, user);
  }
}
