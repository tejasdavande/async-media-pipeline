import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Types } from 'mongoose';
import { StorageService } from '../storage/storage.service';
import { MediaKind } from './media-kind.enum';
import { MediaStatus } from './media-status.enum';
import { UPLOAD_URL_TTL_SECONDS } from './media.constants';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { Media } from './schemas/media.schema';

describe('MediaService', () => {
  let mediaRepository: jest.Mocked<
    Pick<MediaRepository, 'create' | 'findById' | 'transitionStatus'>
  >;
  let storageService: jest.Mocked<Pick<StorageService, 'createUploadUrl' | 'getObjectSize'>>;
  let imageQueue: { add: jest.Mock };
  let videoQueue: { add: jest.Mock };
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
    mediaRepository = { create: jest.fn(), findById: jest.fn(), transitionStatus: jest.fn() };
    storageService = { createUploadUrl: jest.fn(), getObjectSize: jest.fn() };
    imageQueue = { add: jest.fn() };
    videoQueue = { add: jest.fn() };
    service = new MediaService(
      mediaRepository as unknown as MediaRepository,
      storageService as unknown as StorageService,
      imageQueue as unknown as Queue,
      videoQueue as unknown as Queue
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

  describe('completeUpload', () => {
    it('marks the media uploaded once the object exists with the declared size', async () => {
      const media = stored();
      mediaRepository.findById.mockResolvedValue(media);
      storageService.getObjectSize.mockResolvedValue(1024);
      mediaRepository.transitionStatus.mockResolvedValue({
        ...media,
        status: MediaStatus.UPLOADED,
      });

      const result = await service.completeUpload(media._id.toString());

      expect(storageService.getObjectSize).toHaveBeenCalledWith('uploads/abc');
      expect(mediaRepository.transitionStatus).toHaveBeenCalledWith(
        media._id.toString(),
        MediaStatus.PENDING_UPLOAD,
        MediaStatus.UPLOADED
      );
      expect(result.status).toBe(MediaStatus.UPLOADED);
    });

    it.each([
      [MediaKind.VIDEO, () => videoQueue, () => imageQueue],
      [MediaKind.IMAGE, () => imageQueue, () => videoQueue],
    ])('queues %s media on its own queue, keyed by media id', async (kind, target, other) => {
      const media = stored({ kind });
      const id = media._id.toString();
      mediaRepository.findById.mockResolvedValue(media);
      storageService.getObjectSize.mockResolvedValue(1024);
      mediaRepository.transitionStatus.mockResolvedValue({
        ...media,
        status: MediaStatus.UPLOADED,
      });

      await service.completeUpload(id);

      expect(target().add).toHaveBeenCalledWith(kind, { mediaId: id }, { jobId: id });
      expect(other().add).not.toHaveBeenCalled();
    });

    it('puts the media back to pending when the job cannot be queued', async () => {
      const media = stored();
      const id = media._id.toString();
      mediaRepository.findById.mockResolvedValue(media);
      storageService.getObjectSize.mockResolvedValue(1024);
      mediaRepository.transitionStatus.mockResolvedValueOnce({
        ...media,
        status: MediaStatus.UPLOADED,
      });
      videoQueue.add.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.completeUpload(id)).rejects.toThrow(ServiceUnavailableException);
      expect(mediaRepository.transitionStatus).toHaveBeenLastCalledWith(
        id,
        MediaStatus.UPLOADED,
        MediaStatus.PENDING_UPLOAD
      );
    });

    it('throws 404 for unknown media', async () => {
      mediaRepository.findById.mockResolvedValue(null);

      await expect(service.completeUpload(new Types.ObjectId().toString())).rejects.toThrow(
        NotFoundException
      );
    });

    it('rejects media that is no longer pending', async () => {
      mediaRepository.findById.mockResolvedValue(stored({ status: MediaStatus.UPLOADED }));

      await expect(service.completeUpload(new Types.ObjectId().toString())).rejects.toThrow(
        ConflictException
      );
      expect(storageService.getObjectSize).not.toHaveBeenCalled();
    });

    it('rejects when nothing was uploaded', async () => {
      mediaRepository.findById.mockResolvedValue(stored());
      storageService.getObjectSize.mockResolvedValue(null);

      await expect(service.completeUpload(new Types.ObjectId().toString())).rejects.toThrow(
        'file has not been uploaded yet'
      );
      expect(mediaRepository.transitionStatus).not.toHaveBeenCalled();
    });

    it('rejects when the uploaded size does not match the declared size', async () => {
      mediaRepository.findById.mockResolvedValue(stored({ size: 1024 }));
      storageService.getObjectSize.mockResolvedValue(999);

      await expect(service.completeUpload(new Types.ObjectId().toString())).rejects.toThrow(
        'uploaded file is 999 bytes, expected 1024'
      );
      expect(mediaRepository.transitionStatus).not.toHaveBeenCalled();
    });

    it('rejects when a concurrent request already moved it on', async () => {
      mediaRepository.findById.mockResolvedValue(stored());
      storageService.getObjectSize.mockResolvedValue(1024);
      mediaRepository.transitionStatus.mockResolvedValue(null);

      await expect(service.completeUpload(new Types.ObjectId().toString())).rejects.toThrow(
        ConflictException
      );
    });
  });
});
