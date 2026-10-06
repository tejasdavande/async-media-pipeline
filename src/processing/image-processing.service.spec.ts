import { UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { MediaStatus } from '../media/media-status.enum';
import { MediaRepository } from '../media/media.repository';
import { StorageService } from '../storage/storage.service';
import { ImageProcessingService } from './image-processing.service';

describe('ImageProcessingService', () => {
  let mediaRepository: { transitionStatus: jest.Mock };
  let storageService: { getObject: jest.Mock; putObject: jest.Mock };
  let service: ImageProcessingService;

  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#336699' } })
      .png()
      .toBuffer();

  beforeEach(() => {
    mediaRepository = {
      transitionStatus: jest.fn().mockResolvedValue({ sourceKey: 'uploads/abc' }),
    };
    storageService = { getObject: jest.fn(), putObject: jest.fn() };
    service = new ImageProcessingService(
      mediaRepository as unknown as MediaRepository,
      storageService as unknown as StorageService
    );
  });

  it('writes a webp thumbnail that fits in 320px and marks the media ready', async () => {
    storageService.getObject.mockResolvedValue(await png(1200, 800));

    await service.process('m1');

    expect(mediaRepository.transitionStatus).toHaveBeenNthCalledWith(
      1,
      'm1',
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.PROCESSING
    );
    expect(storageService.getObject).toHaveBeenCalledWith('uploads/abc');

    const [key, body, contentType] = storageService.putObject.mock.calls[0];
    expect(key).toBe('thumbnails/m1.webp');
    expect(contentType).toBe('image/webp');
    const thumbnail = await sharp(body).metadata();
    expect(thumbnail).toEqual(expect.objectContaining({ format: 'webp', width: 320, height: 213 }));

    expect(mediaRepository.transitionStatus).toHaveBeenLastCalledWith(
      'm1',
      MediaStatus.PROCESSING,
      MediaStatus.READY,
      { width: 1200, height: 800, thumbnailKey: 'thumbnails/m1.webp' }
    );
  });

  it('does not upscale images smaller than the thumbnail', async () => {
    storageService.getObject.mockResolvedValue(await png(100, 50));

    await service.process('m1');

    const thumbnail = await sharp(storageService.putObject.mock.calls[0][1]).metadata();
    expect(thumbnail).toEqual(expect.objectContaining({ width: 100, height: 50 }));
  });

  it('skips media that is not waiting for processing', async () => {
    mediaRepository.transitionStatus.mockResolvedValue(null);

    await service.process('m1');

    expect(storageService.getObject).not.toHaveBeenCalled();
  });

  it('fails without retrying when the file is not a decodable image', async () => {
    storageService.getObject.mockResolvedValue(Buffer.from('definitely not a png'));

    await expect(service.process('m1')).rejects.toThrow(UnrecoverableError);
    expect(storageService.putObject).not.toHaveBeenCalled();
  });

  it('marks media failed with the reason', async () => {
    await service.markFailed('m1', 'boom');

    expect(mediaRepository.transitionStatus).toHaveBeenCalledWith(
      'm1',
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.FAILED,
      { failureReason: 'boom' }
    );
  });
});
