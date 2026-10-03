import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../../common/auth/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Small id/name lists for filters and pickers. */
@Controller('lookups')
export class LookupsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('companies')
  @RequirePermissions('orders.read')
  companies(): Promise<{ id: string; name: string }[]> {
    return this.prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
