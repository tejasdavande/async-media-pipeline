import { Job, UnrecoverableError } from 'bullmq';
import { ProcessingJobData } from '../media/processing-job';
import { ImageProcessingService } from './image-processing.service';
import { ImageProcessor } from './image.processor';

describe('ImageProcessor', () => {
  let imageProcessingService: { process: jest.Mock; markFailed: jest.Mock };
  let processor: ImageProcessor;

  const job = (attemptsMade: number) =>
    ({ data: { mediaId: 'm1' }, attemptsMade, opts: { attempts: 3 } }) as Job<ProcessingJobData>;

  beforeEach(() => {
    imageProcessingService = { process: jest.fn(), markFailed: jest.fn() };
    processor = new ImageProcessor(imageProcessingService as unknown as ImageProcessingService);
  });

  it('processes the media from the job', async () => {
    await processor.process(job(0));

    expect(imageProcessingService.process).toHaveBeenCalledWith('m1');
  });

  it('leaves the media alone while retries are left', async () => {
    await processor.onFailed(job(1), new Error('s3 timeout'));

    expect(imageProcessingService.markFailed).not.toHaveBeenCalled();
  });

  it('marks the media failed after the last attempt', async () => {
    await processor.onFailed(job(3), new Error('s3 timeout'));

    expect(imageProcessingService.markFailed).toHaveBeenCalledWith('m1', 's3 timeout');
  });

  it('marks the media failed straight away on an unrecoverable error', async () => {
    await processor.onFailed(job(1), new UnrecoverableError('could not decode image'));

    expect(imageProcessingService.markFailed).toHaveBeenCalledWith('m1', 'could not decode image');
  });
});
