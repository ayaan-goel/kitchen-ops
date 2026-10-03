import { Global, Module } from '@nestjs/common';
import { CutoffController } from './cutoff.controller';
import { CutoffScheduler } from './cutoff.scheduler';
import { CutoffService } from './cutoff.service';

@Global()
@Module({
  controllers: [CutoffController],
  providers: [CutoffService, CutoffScheduler],
  exports: [CutoffService],
})
export class CutoffModule {}
