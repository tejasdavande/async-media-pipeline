import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StorageService } from '../storage/storage.service';
import { MediaKind } from './media-kind.enum';
import { MediaStatus } from './media-status.enum';
import { UPLOAD_URL_TTL_SECONDS } from './media.constants';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { Media } from './schemas/media.schema';

describe('MediaService', () => {
  let mediaRepository: jest.Mocked<Pick<MediaRepository, 'create' | 'findById'>>;
  let storageService: jest.Mocked<Pick<StorageService, 'createUploadUrl'>>;
  let service: MediaService;

  const stored = (overrides: Partial<Media> = {}): Media => ({
    _id: new Types.ObjectId(),
    sourceKey: 'uploads/abc',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    kind: MediaKind.VIDEO,
    size: 1024,
    status: MediaStatus.PENDING_UPLOAD,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mediaRepository = { create: jest.fn(), findById: jest.fn() };
    storageService = { createUploadUrl: jest.fn() };
    service = new MediaService(
      mediaRepository as unknown as MediaRepository,
      storageService as unknown as StorageService
    );
  });

  describe('createUpload', () => {
    it('stores a pending record and signs an upload url for its key', async () => {
      const media = stored({ contentType: 'image/png', kind: MediaKind.IMAGE });
      mediaRepository.create.mockResolvedValue(media);
      storageService.createUploadUrl.mockResolvedValue('https://signed');

      const ticket = await service.createUpload({
        filename: 'photo.png',
        contentType: 'image/png',
        size: 2048,
      });

      expect(mediaRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceKey: expect.stringMatching(/^uploads\/[0-9a-f-]{36}$/),
          contentType: 'image/png',
          kind: MediaKind.IMAGE,
          size: 2048,
        })
      );
      expect(storageService.createUploadUrl).toHaveBeenCalledWith(
        media.sourceKey,
        'image/png',
        UPLOAD_URL_TTL_SECONDS
      );
      expect(ticket.uploadUrl).toBe('https://signed');
      expect(ticket.media).toEqual(
        expect.objectContaining({ id: media._id.toString(), status: MediaStatus.PENDING_UPLOAD })
      );
      expect(ticket.media).not.toHaveProperty('sourceKey');
    });
  });

  describe('getById', () => {
    it('returns the media when it exists', async () => {
      const media = stored();
      mediaRepository.findById.mockResolvedValue(media);

      await expect(service.getById(media._id.toString())).resolves.toEqual(
        expect.objectContaining({ id: media._id.toString(), filename: 'clip.mp4' })
      );
    });

    it('throws 404 when it does not', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(service.getById(new Types.ObjectId().toString())).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
