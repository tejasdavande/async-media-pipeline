import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { IMAGE_PROCESSING_QUEUE } from '../media/media.constants';
import { ProcessingJobData } from '../media/processing-job';
import { ImageProcessingService } from './image-processing.service';

@Processor(IMAGE_PROCESSING_QUEUE, { concurrency: 4 })
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  constructor(private readonly imageProcessingService: ImageProcessingService) {
    super();
  }

  async process(job: Job<ProcessingJobData>): Promise<void> {
    await this.imageProcessingService.process(job.data.mediaId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessingJobData> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }

    const retriesLeft = job.attemptsMade < (job.opts.attempts ?? 1);
    if (retriesLeft && !(error instanceof UnrecoverableError)) {
      this.logger.warn(
        `media ${job.data.mediaId} attempt ${job.attemptsMade} failed: ${error.message}`
      );
      return;
    }

    this.logger.error(`media ${job.data.mediaId} failed: ${error.message}`);
    await this.imageProcessingService.markFailed(job.data.mediaId, error.message);
  }
}
