import { Controller, Get, Module } from '@nestjs/common';
import type { DashboardDto } from '@fernleaf/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboards: DashboardService) {}

  /** The caller's dashboard, chosen by their role's `dashboard` field (ACC-05). Driver figures are scoped to the caller. */
  @Get()
  @RequirePermissions('dashboard.view')
  get(@CurrentUser() user: AuthUser): Promise<DashboardDto> {
    return this.dashboards.forUser(user);
  }
}

@Module({
  imports: [KitchenModule, CatalogueModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
