import { Body, Controller, Get, HttpCode, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type DeliverDropInput,
  deliverDropSchema,
  type DriverDayDto,
  type DropDto,
  PHOTO_MAX_BYTES,
  type PhotoUploadDto,
  uuidSchema,
} from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { DispatchService } from './dispatch.service';

const idParam = new ZodValidationPipe(uuidSchema);

/**
 * Driver view (TRD §6.12). Every call is scoped to the signed-in driver's own drops for kitchen
 * today; anything else is a 404 (DSP-06).
 */
@Controller('driver/drops')
export class DriverController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  @RequirePermissions('deliveries.own')
  today(@CurrentUser() user: AuthUser): Promise<DriverDayDto> {
    return this.dispatch.driverDay(user);
  }

  @Post(':id/picked-up')
  @HttpCode(200)
  @RequirePermissions('deliveries.own')
  pickedUp(@Param('id', idParam) id: string, @CurrentUser() user: AuthUser): Promise<DropDto> {
    return this.dispatch.driverPickedUp(id, user);
  }

  @Post(':id/photo')
  @HttpCode(201)
  @RequirePermissions('deliveries.own')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_MAX_BYTES, files: 1 } }))
  photo(
    @Param('id', idParam) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<PhotoUploadDto> {
    return this.dispatch.driverPhoto(id, file?.buffer, user);
  }

  @Post(':id/delivered')
  @HttpCode(200)
  @RequirePermissions('deliveries.own')
  delivered(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(deliverDropSchema)) body: DeliverDropInput,
    @CurrentUser() user: AuthUser,
  ): Promise<DropDto> {
    return this.dispatch.driverDelivered(id, body, user);
  }
}
