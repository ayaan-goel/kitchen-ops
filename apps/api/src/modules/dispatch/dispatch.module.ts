import { Global, Module } from '@nestjs/common';
import { DropService } from './drop.service';

@Global()
@Module({
  providers: [DropService],
  exports: [DropService],
})
export class DispatchModule {}
