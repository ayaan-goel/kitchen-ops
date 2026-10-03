import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  calendarDateSchema,
  type KitchenBoardDto,
  type KitchenSummaryDto,
  type UnitActionResultDto,
  uuidSchema,
} from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ClockService } from '../../common/clock/clock.service';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { KitchenService } from './kitchen.service';

const dateQuery = z.object({ date: calendarDateSchema.optional() });
const idParam = new ZodValidationPipe(uuidSchema);

@Controller()
export class KitchenController {
  constructor(
    private readonly kitchen: KitchenService,
    private readonly clock: ClockService,
  ) {}

  @Get('kitchen/board')
  @RequirePermissions('kitchen.read')
  board(@Query(new ZodValidationPipe(dateQuery)) q: z.infer<typeof dateQuery>): Promise<KitchenBoardDto> {
    return this.kitchen.board(q.date ?? this.clock.today());
  }

  @Get('kitchen/summary')
  @RequirePermissions('kitchen.read')
  summary(@Query(new ZodValidationPipe(dateQuery)) q: z.infer<typeof dateQuery>): Promise<KitchenSummaryDto> {
    return this.kitchen.summary(q.date ?? this.clock.today());
  }

  @Post('kitchen/units/:id/start')
  @HttpCode(200)
  @RequirePermissions('kitchen.work')
  start(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<UnitActionResultDto> {
    return this.kitchen.start(id, user);
  }

  @Post('kitchen/units/:id/done')
  @HttpCode(200)
  @RequirePermissions('kitchen.work')
  done(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<UnitActionResultDto> {
    return this.kitchen.done(id, user);
  }

  @Post('orders/:id/force-complete')
  @HttpCode(200)
  @RequirePermissions('kitchen.forceComplete')
  forceComplete(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<UnitActionResultDto['order']> {
    return this.kitchen.forceComplete(id, user);
  }
}
