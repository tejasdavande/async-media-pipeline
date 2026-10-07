import { UnrecoverableError } from 'bullmq';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { MediaStatus } from '../media/media-status.enum';
import { MediaRepository } from '../media/media.repository';
import { StorageService } from '../storage/storage.service';
import { FfmpegService, VideoProbe } from './ffmpeg.service';
import { VideoProcessingService } from './video-processing.service';

describe('VideoProcessingService', () => {
  let mediaRepository: { transitionStatus: jest.Mock };
  let storageService: { downloadToFile: jest.Mock; uploadFile: jest.Mock; putObject: jest.Mock };
  let ffmpegService: { probe: jest.Mock; transcodeHls: jest.Mock; extractFrame: jest.Mock };
  let service: VideoProcessingService;

  const probe: VideoProbe = { width: 1920, height: 1080, duration: 12.5, hasAudio: true };

  const writeHls = async (_input: string, dir: string) => {
    for (const file of ['master.m3u8', '720p/index.m3u8', '720p/segment_000.ts']) {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), file);
    }
  };

  const writePoster = async (_input: string, output: string) => {
    await sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#000' } })
      .png()
      .toFile(output);
  };

  beforeEach(() => {
    mediaRepository = {
      transitionStatus: jest.fn().mockResolvedValue({ sourceKey: 'uploads/abc' }),
    };
    storageService = { downloadToFile: jest.fn(), uploadFile: jest.fn(), putObject: jest.fn() };
    ffmpegService = {
      probe: jest.fn().mockResolvedValue(probe),
      transcodeHls: jest.fn().mockImplementation(writeHls),
      extractFrame: jest.fn().mockImplementation(writePoster),
    };
    service = new VideoProcessingService(
      mediaRepository as unknown as MediaRepository,
      storageService as unknown as StorageService,
      ffmpegService as unknown as FfmpegService
    );
  });

  it('transcodes to hls, uploads the output and marks the media ready', async () => {
    await service.process('m1');

    expect(mediaRepository.transitionStatus).toHaveBeenNthCalledWith(
      1,
      'm1',
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.PROCESSING
    );
    const [sourceKey, sourcePath] = storageService.downloadToFile.mock.calls[0];
    expect(sourceKey).toBe('uploads/abc');
    expect(ffmpegService.probe).toHaveBeenCalledWith(sourcePath);

    const renditions = ffmpegService.transcodeHls.mock.calls[0][3];
    expect(renditions.map((r: { name: string }) => r.name)).toEqual(['720p', '480p']);
    expect(ffmpegService.extractFrame).toHaveBeenCalledWith(sourcePath, expect.any(String), 1);

    const uploads = storageService.uploadFile.mock.calls.map(([key, , type]) => [key, type]);
    expect(uploads).toEqual(
      expect.arrayContaining([
        ['hls/m1/master.m3u8', 'application/vnd.apple.mpegurl'],
        ['hls/m1/720p/index.m3u8', 'application/vnd.apple.mpegurl'],
        ['hls/m1/720p/segment_000.ts', 'video/mp2t'],
      ])
    );
    expect(uploads).toHaveLength(3);

    const [thumbnailKey, thumbnail, thumbnailType] = storageService.putObject.mock.calls[0];
    expect(thumbnailKey).toBe('thumbnails/m1.webp');
    expect(thumbnailType).toBe('image/webp');
    expect(await sharp(thumbnail).metadata()).toEqual(
      expect.objectContaining({ format: 'webp', width: 320, height: 180 })
    );

    expect(mediaRepository.transitionStatus).toHaveBeenLastCalledWith(
      'm1',
      MediaStatus.PROCESSING,
      MediaStatus.READY,
      {
        width: 1920,
        height: 1080,
        duration: 12.5,
        thumbnailKey: 'thumbnails/m1.webp',
        hlsKey: 'hls/m1/master.m3u8',
      }
    );
    expect(existsSync(dirname(sourcePath))).toBe(false);
  });

  it('takes the poster from the middle of very short clips', async () => {
    ffmpegService.probe.mockResolvedValue({ ...probe, duration: 0.4 });

    await service.process('m1');

    expect(ffmpegService.extractFrame.mock.calls[0][2]).toBeCloseTo(0.2);
  });

  it('skips media that is not waiting for processing', async () => {
    mediaRepository.transitionStatus.mockResolvedValue(null);

    await service.process('m1');

    expect(storageService.downloadToFile).not.toHaveBeenCalled();
  });

  it('fails without retrying when the file is not a readable video', async () => {
    ffmpegService.probe.mockRejectedValue(new Error('ffprobe failed: Invalid data'));

    await expect(service.process('m1')).rejects.toThrow(UnrecoverableError);
    expect(ffmpegService.transcodeHls).not.toHaveBeenCalled();
  });

  it('lets a failed transcode be retried and still cleans up', async () => {
    ffmpegService.transcodeHls.mockRejectedValue(new Error('ffmpeg failed: killed'));

    const error = await service.process('m1').catch((e: Error) => e);

    expect(error).not.toBeInstanceOf(UnrecoverableError);
    const sourcePath = storageService.downloadToFile.mock.calls[0][1];
    expect(existsSync(dirname(sourcePath))).toBe(false);
    expect(mediaRepository.transitionStatus).toHaveBeenCalledTimes(1);
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
