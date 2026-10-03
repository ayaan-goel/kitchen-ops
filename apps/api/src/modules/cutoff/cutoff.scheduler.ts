import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CutoffService } from './cutoff.service';

/**
 * Processes cut-offs shortly after they pass. The tick is an in-memory comparison, so an idle
 * app does not wake the database (Neon free compute budget, TRD §6.9). Correctness never depends
 * on this timer: reads call CutoffService.ensureProcessed() first.
 */
@Injectable()
export class CutoffScheduler {
  private readonly logger = new Logger(CutoffScheduler.name);

  constructor(private readonly cutoff: CutoffService) {}

  @Interval(60_000)
  async tick(): Promise<void> {
    if (!this.cutoff.isDue()) return;
    try {
      await this.cutoff.ensureProcessed('SCHEDULED');
    } catch (err) {
      this.logger.error({ err }, 'Scheduled cut-off processing failed');
    }
  }
}
