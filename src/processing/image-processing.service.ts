import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { MediaStatus } from '../media/media-status.enum';
import { MediaRepository } from '../media/media.repository';
import { StorageService } from '../storage/storage.service';

export const THUMBNAIL_SIZE = 320;

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageService: StorageService
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

    const source = await this.storageService.getObject(media.sourceKey);

    let width: number | undefined;
    let height: number | undefined;
    let thumbnail: Buffer;
    try {
      const image = sharp(source).rotate();
      ({ width, height } = await image.metadata());
      thumbnail = await image
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (error) {
      throw new UnrecoverableError(`could not decode image: ${(error as Error).message}`);
    }

    const thumbnailKey = `thumbnails/${mediaId}.webp`;
    await this.storageService.putObject(thumbnailKey, thumbnail, 'image/webp');

    await this.mediaRepository.transitionStatus(
      mediaId,
      MediaStatus.PROCESSING,
      MediaStatus.READY,
      {
        width,
        height,
        thumbnailKey,
      }
    );
  }

  async markFailed(mediaId: string, reason: string): Promise<void> {
    await this.mediaRepository.transitionStatus(
      mediaId,
      [MediaStatus.UPLOADED, MediaStatus.PROCESSING],
      MediaStatus.FAILED,
      { failureReason: reason }
    );
  }
}
