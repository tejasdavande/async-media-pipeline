import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VIDEO_PROCESSING_QUEUE } from '../media/media.constants';
import { ProcessingJobData } from '../media/processing-job';
import { isFinalFailure } from './is-final-failure';
import { VideoProcessingService } from './video-processing.service';

@Processor(VIDEO_PROCESSING_QUEUE, { concurrency: 1 })
export class VideoProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(private readonly videoProcessingService: VideoProcessingService) {
    super();
  }

  async process(job: Job<ProcessingJobData>): Promise<void> {
    await this.videoProcessingService.process(job.data.mediaId);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessingJobData> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }

    if (!isFinalFailure(job, error)) {
      this.logger.warn(
        `media ${job.data.mediaId} attempt ${job.attemptsMade} failed: ${error.message}`
      );
      return;
    }

    this.logger.error(`media ${job.data.mediaId} failed: ${error.message}`);
    await this.videoProcessingService.markFailed(job.data.mediaId, error.message);
  }
}
