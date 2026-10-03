import { Module } from '@nestjs/common';
import { OrderingModule } from '../ordering/ordering.module';
import { CatalogueController, MenuAdminController, PricingController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { MenuAdminService } from './menu-admin.service';
import { PricingService } from './pricing.service';
import { ReferenceService } from './reference.service';

@Module({
  imports: [OrderingModule],
  controllers: [CatalogueController, PricingController, MenuAdminController],
  providers: [ReferenceService, CatalogueService, PricingService, MenuAdminService],
  exports: [PricingService],
})
export class CatalogueModule {}
