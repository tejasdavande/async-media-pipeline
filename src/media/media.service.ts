import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { UploadTicketDto } from './dto/upload-ticket.dto';
import { ALLOWED_CONTENT_TYPES, UPLOAD_URL_TTL_SECONDS } from './media.constants';
import { MediaRepository } from './media.repository';

@Injectable()
export class MediaService {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly storageService: StorageService
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
    const media = await this.mediaRepository.findById(id);
    if (!media) {
      throw new NotFoundException('media not found');
    }

    return MediaResponseDto.fromSchema(media);
  }
}
