import { ConfigService } from '@nestjs/config';
import { NotFound, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const values: Record<string, unknown> = {
    S3_BUCKET: 'media',
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: 'http://localhost:4566',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret',
  };
  // a real ConfigService reads process.env before its own values, so ci's S3_* vars would leak in
  const config = {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;

  it('signs a PUT url for the key that expires when asked', async () => {
    const service = new StorageService(config);

    const url = new URL(await service.createUploadUrl('uploads/abc.mp4', 'video/mp4', 900));

    expect(url.origin).toBe('http://localhost:4566');
    expect(url.pathname).toBe('/media/uploads/abc.mp4');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('binds the content type into the signature', async () => {
    const service = new StorageService(config);

    const url = new URL(await service.createUploadUrl('uploads/abc.mp4', 'video/mp4', 900));

    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-type;host');
  });

  it('does not bake an empty-body checksum into the url', async () => {
    const service = new StorageService(config);

    const url = new URL(await service.createUploadUrl('uploads/abc.mp4', 'video/mp4', 900));

    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.has('x-amz-sdk-checksum-algorithm')).toBe(false);
  });

  describe('getObjectSize', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns the content length of an existing object', async () => {
      jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ ContentLength: 2048 } as never);

      await expect(new StorageService(config).getObjectSize('uploads/abc')).resolves.toBe(2048);
    });

    it('returns null when the object does not exist', async () => {
      jest
        .spyOn(S3Client.prototype, 'send')
        .mockRejectedValue(new NotFound({ message: 'NotFound', $metadata: {} }) as never);

      await expect(new StorageService(config).getObjectSize('uploads/abc')).resolves.toBeNull();
    });

    it('rethrows other errors', async () => {
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('access denied') as never);

      await expect(new StorageService(config).getObjectSize('uploads/abc')).rejects.toThrow(
        'access denied'
      );
    });
  });
});
