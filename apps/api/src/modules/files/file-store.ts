import { Injectable } from '@nestjs/common';
import { PHOTO_MIME_TYPES } from '@fernleaf/shared';
import { RuleViolation } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';

export type FileKind = 'DELIVERY_PHOTO' | 'DISH_IMAGE';
export type ImageMime = (typeof PHOTO_MIME_TYPES)[number];

export interface StoredFileMeta {
  id: string;
  kind: FileKind;
  mimeType: string;
  sizeBytes: number;
  createdById: string | null;
}

/**
 * Where uploaded bytes live (A-35). Postgres `bytea` today; an S3/R2 implementation can replace
 * this class without touching callers.
 */
@Injectable()
export class FileStore {
  constructor(private readonly prisma: PrismaService) {}

  async put(input: { kind: FileKind; mimeType: ImageMime; data: Buffer; createdById: string }): Promise<StoredFileMeta> {
    return this.prisma.storedFile.create({
      data: { kind: input.kind, mimeType: input.mimeType, sizeBytes: input.data.length, data: new Uint8Array(input.data), createdById: input.createdById },
      select: { id: true, kind: true, mimeType: true, sizeBytes: true, createdById: true },
    });
  }

  async get(id: string): Promise<(StoredFileMeta & { data: Uint8Array; dropDriverId: string | null }) | null> {
    const file = await this.prisma.storedFile.findUnique({
      where: { id },
      select: { id: true, kind: true, mimeType: true, sizeBytes: true, createdById: true, data: true, drop: { select: { driverId: true } } },
    });
    if (!file) return null;
    const { drop, ...rest } = file;
    return { ...rest, dropDriverId: drop?.driverId ?? null };
  }
}

/**
 * The real type of an uploaded image from its first bytes; the client's Content-Type and file
 * name are not trusted.
 */
export function sniffImage(data: Buffer): ImageMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function assertImage(data: Buffer | undefined): ImageMime {
  if (!data || data.length === 0) {
    throw new RuleViolation('VALIDATION_FAILED', 'Choose a photo to upload.', [{ path: ['file'], code: 'VALIDATION_FAILED', message: 'No file received.' }]);
  }
  const mime = sniffImage(data);
  if (!mime) {
    throw new RuleViolation('VALIDATION_FAILED', 'Photos must be JPEG, PNG or WebP images.', [
      { path: ['file'], code: 'VALIDATION_FAILED', message: 'Unsupported image type.' },
    ]);
  }
  return mime;
}
