import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const config = new ConfigService({
    S3_BUCKET: 'media',
    S3_REGION: 'us-east-1',
    S3_ENDPOINT: 'http://localhost:4566',
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret',
  });

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
});
