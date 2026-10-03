import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { uuidSchema } from '@fernleaf/shared';
import type { Response } from 'express';
import type { AuthUser } from '../../common/auth/auth-user';
import { Authenticated, CurrentUser } from '../../common/auth/decorators';
import { NotFound } from '../../common/errors/domain-error';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { FileStore } from './file-store';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FileStore) {}

  /**
   * TRD §6.13. A delivery photo is visible to dispatch, to the drop's driver and to whoever
   * uploaded it; anything else is a 404 so file ids can't be probed.
   */
  @Get(':id')
  @Authenticated()
  async get(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.files.get(id);
    const allowed =
      file &&
      (file.kind === 'DISH_IMAGE' ||
        user.permissions.has('dispatch.read') ||
        file.createdById === user.id ||
        file.dropDriverId === user.id);
    if (!file || !allowed) throw new NotFound('File not found');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(file.data), { type: file.mimeType, length: file.sizeBytes });
  }
}
