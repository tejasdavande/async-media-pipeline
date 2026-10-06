import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { UploadTicketDto } from './dto/upload-ticket.dto';
import { MediaKind } from './media-kind.enum';
import { MediaStatus } from './media-status.enum';
import {
  ALLOWED_CONTENT_TYPES,
  IMAGE_PROCESSING_QUEUE,
  UPLOAD_URL_TTL_SECONDS,
  VIDEO_PROCESSING_QUEUE,
} from './media.constants';
import { MediaRepository } from './media.repository';
import { ProcessingJobData } from './processing-job';
import { Media } from './schemas/media.schema';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageService: StorageService,
    @InjectQueue(IMAGE_PROCESSING_QUEUE) private readonly imageQueue: Queue<ProcessingJobData>,
    @InjectQueue(VIDEO_PROCESSING_QUEUE) private readonly videoQueue: Queue<ProcessingJobData>
  ) {}

  async createUpload(payload: CreateUploadDto): Promise<UploadTicketDto> {
    const media = await this.mediaRepository.create({
      sourceKey: `uploads/${randomUUID()}`,
      filename: payload.filename,
      contentType: payload.contentType,
      kind: ALLOWED_CONTENT_TYPES[payload.contentType],
      size: payload.size,
    });

    const uploadUrl = await this.storageService.createUploadUrl(
      media.sourceKey,
      media.contentType,
      UPLOAD_URL_TTL_SECONDS
    );

    return {
      media: MediaResponseDto.fromSchema(media),
      uploadUrl,
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  async getById(id: string): Promise<MediaResponseDto> {
    return MediaResponseDto.fromSchema(await this.findOrFail(id));
  }

  async completeUpload(id: string): Promise<MediaResponseDto> {
    const media = await this.findOrFail(id);
    if (media.status !== MediaStatus.PENDING_UPLOAD) {
      throw new ConflictException(`media is already ${media.status}`);
    }

    const size = await this.storageService.getObjectSize(media.sourceKey);
    if (size === null) {
      throw new ConflictException('file has not been uploaded yet');
    }
    if (size !== media.size) {
      throw new ConflictException(`uploaded file is ${size} bytes, expected ${media.size}`);
    }

    const updated = await this.mediaRepository.transitionStatus(
      id,
      MediaStatus.PENDING_UPLOAD,
      MediaStatus.UPLOADED
    );
    if (!updated) {
      throw new ConflictException('media is no longer pending upload');
    }

    try {
      await this.enqueueProcessing(updated);
    } catch (error) {
      this.logger.error(`failed to queue media ${id}: ${(error as Error).message}`);
      await this.mediaRepository.transitionStatus(
        id,
        MediaStatus.UPLOADED,
        MediaStatus.PENDING_UPLOAD
      );
      throw new ServiceUnavailableException('could not queue media for processing, try again');
    }

    return MediaResponseDto.fromSchema(updated);
  }

  private async enqueueProcessing(media: Media): Promise<void> {
    const queue = media.kind === MediaKind.VIDEO ? this.videoQueue : this.imageQueue;
    const mediaId = media._id.toString();

    await queue.add(media.kind, { mediaId }, { jobId: mediaId });
  }

  private async findOrFail(id: string): Promise<Media> {
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new NotFoundException('media not found');
    }

    return media;
  }
}
