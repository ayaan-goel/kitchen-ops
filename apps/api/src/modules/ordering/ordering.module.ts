import { Module } from '@nestjs/common';
import { LookupsController } from './lookups.controller';
import { MenuCatalogueService } from './menu-catalogue.service';
import { OrderPipelineService } from './order-pipeline.service';
import { OrderingController } from './ordering.controller';
import { OrderingService } from './ordering.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrderingController, OrdersController, LookupsController],
  providers: [MenuCatalogueService, OrderPipelineService, OrderingService, OrdersService],
  exports: [MenuCatalogueService, OrderPipelineService, OrdersService],
})
export class OrderingModule {}
