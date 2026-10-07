import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { extname, join, sep } from 'path';
import sharp from 'sharp';
import { MediaStatus } from '../media/media-status.enum';
import { MediaRepository } from '../media/media.repository';
import { StorageService } from '../storage/storage.service';
import { FfmpegService, HLS_MASTER_PLAYLIST, VideoProbe } from './ffmpeg.service';
import { pickRenditions } from './hls-ladder';
import { THUMBNAIL_SIZE } from './image-processing.service';

const HLS_CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
};

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService
  ) {}

  async process(mediaId: string): Promise<void> {
    const media = await this.mediaRepository.transitionStatus(
      mediaId,
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.PROCESSING
    );
    if (!media) {
      this.logger.warn(`skipping media ${mediaId}: not found or not waiting for processing`);
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), `media-${mediaId}-`));
    try {
      const source = join(workDir, 'source');
      await this.storageService.downloadToFile(media.sourceKey, source);

      let probe: VideoProbe;
      try {
        probe = await this.ffmpegService.probe(source);
      } catch (error) {
        throw new UnrecoverableError(`could not read video: ${(error as Error).message}`);
      }

      const hlsDir = join(workDir, 'hls');
      const renditions = pickRenditions(probe.width, probe.height);
      await this.ffmpegService.transcodeHls(source, hlsDir, probe, renditions);

      const poster = join(workDir, 'poster.png');
      await this.ffmpegService.extractFrame(source, poster, Math.min(1, probe.duration / 2));
      const thumbnail = await sharp(poster)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const hlsPrefix = `hls/${mediaId}`;
      await this.uploadHls(hlsDir, hlsPrefix);
      const thumbnailKey = `thumbnails/${mediaId}.webp`;
      await this.storageService.putObject(thumbnailKey, thumbnail, 'image/webp');

      await this.mediaRepository.transitionStatus(
        mediaId,
        MediaStatus.PROCESSING,
        MediaStatus.READY,
        {
          width: probe.width,
          height: probe.height,
          duration: probe.duration,
          thumbnailKey,
          hlsKey: `${hlsPrefix}/${HLS_MASTER_PLAYLIST}`,
        }
      );
      this.logger.log(
        `media ${mediaId} transcoded to ${renditions.map((rendition) => rendition.name).join(', ')}`
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  async markFailed(mediaId: string, reason: string): Promise<void> {
    await this.mediaRepository.transitionStatus(
      mediaId,
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.FAILED,
      { failureReason: reason }
    );
  }

  private async uploadHls(dir: string, prefix: string): Promise<void> {
    const files = await readdir(dir, { recursive: true });

    for (const file of files) {
      const contentType = HLS_CONTENT_TYPES[extname(file)];
      if (!contentType) {
        continue;
      }

      await this.storageService.uploadFile(
        `${prefix}/${file.split(sep).join('/')}`,
        join(dir, file),
        contentType
      );
    }
  }
}
