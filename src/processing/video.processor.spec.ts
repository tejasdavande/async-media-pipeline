import { Job, UnrecoverableError } from 'bullmq';
import { ProcessingJobData } from '../media/processing-job';
import { VideoProcessingService } from './video-processing.service';
import { VideoProcessor } from './video.processor';

describe('VideoProcessor', () => {
  let videoProcessingService: { process: jest.Mock; markFailed: jest.Mock };
  let processor: VideoProcessor;

  const job = (attemptsMade: number) =>
    ({ data: { mediaId: 'm1' }, attemptsMade, opts: { attempts: 3 } }) as Job<ProcessingJobData>;

  beforeEach(() => {
    videoProcessingService = { process: jest.fn(), markFailed: jest.fn() };
    processor = new VideoProcessor(videoProcessingService as unknown as VideoProcessingService);
  });

  it('processes the media from the job', async () => {
    await processor.process(job(0));

    expect(videoProcessingService.process).toHaveBeenCalledWith('m1');
  });

  it('leaves the media alone while retries are left', async () => {
    await processor.onFailed(job(1), new Error('ffmpeg failed: killed'));

    expect(videoProcessingService.markFailed).not.toHaveBeenCalled();
  });

  it('marks the media failed after the last attempt', async () => {
    await processor.onFailed(job(3), new Error('ffmpeg failed: killed'));

    expect(videoProcessingService.markFailed).toHaveBeenCalledWith('m1', 'ffmpeg failed: killed');
  });

  it('marks the media failed straight away on an unrecoverable error', async () => {
    await processor.onFailed(job(1), new UnrecoverableError('could not read video'));

    expect(videoProcessingService.markFailed).toHaveBeenCalledWith('m1', 'could not read video');
  });
});
