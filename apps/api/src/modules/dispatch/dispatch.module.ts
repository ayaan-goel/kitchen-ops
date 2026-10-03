import { Global, Module } from '@nestjs/common';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { DriverController } from './driver.controller';
import { DropService } from './drop.service';

/** Global so ordering and cut-off can attach orders to drops through `DropService`. */
@Global()
@Module({
  controllers: [DispatchController, DriverController],
  providers: [DropService, DispatchService],
  exports: [DropService, DispatchService],
})
export class DispatchModule {}
