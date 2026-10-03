import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { calendarDateSchema, type CutoffDayDto, type CutoffRunResultDto } from '@fernleaf/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { CutoffService } from './cutoff.service';

const windowQuery = z.object({ from: calendarDateSchema.optional(), to: calendarDateSchema.optional() });
const runBody = z.object({ closeEarly: z.boolean().default(false) });

@Controller('cutoffs')
export class CutoffController {
  constructor(private readonly cutoff: CutoffService) {}

  @Get()
  @RequirePermissions('cutoff.run')
  list(@Query(new ZodValidationPipe(windowQuery)) query: z.infer<typeof windowQuery>): Promise<CutoffDayDto[]> {
    const fallback = this.cutoff.defaultWindow();
    return this.cutoff.listDays(query.from ?? fallback.from, query.to ?? fallback.to);
  }

  @Post(':date/run')
  @HttpCode(200)
  @RequirePermissions('cutoff.run')
  run(
    @Param('date', new ZodValidationPipe(calendarDateSchema)) date: string,
    @Body(new ZodValidationPipe(runBody)) body: z.infer<typeof runBody>,
    @CurrentUser() user: AuthUser,
  ): Promise<CutoffRunResultDto> {
    return this.cutoff.runManually(date, body.closeEarly, user.id);
  }
}
