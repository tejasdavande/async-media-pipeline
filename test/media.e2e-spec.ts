import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { VIDEO_PROCESSING_QUEUE } from '../src/media/media.constants';

describe('Media uploads (e2e)', () => {
  let app: INestApplication;
  const file = randomBytes(4096);

  const createUpload = async (size = file.length) => {
    const res = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', size })
      .expect(201);

    return res.body as { media: { id: string; status: string }; uploadUrl: string };
  };

  const put = (url: string, contentType: string) =>
    fetch(url, { method: 'PUT', headers: { 'content-type': contentType }, body: file });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects content types it cannot process', async () => {
    await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'notes.pdf', contentType: 'application/pdf', size: 100 })
      .expect(400);
  });

  it('uploads through the presigned url and completes', async () => {
    const { media, uploadUrl } = await createUpload();
    expect(media.status).toBe('pending_upload');

    await request(app.getHttpServer()).post(`/media/${media.id}/complete`).expect(409);

    expect((await put(uploadUrl, 'video/mp4')).status).toBe(200);

    const completed = await request(app.getHttpServer())
      .post(`/media/${media.id}/complete`)
      .expect(200);
    expect(completed.body.status).toBe('uploaded');

    const fetched = await request(app.getHttpServer()).get(`/media/${media.id}`).expect(200);
    expect(fetched.body.status).toBe('uploaded');
    expect(fetched.body.sourceKey).toBeUndefined();

    const queue = app.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));
    const job = await queue.getJob(media.id);
    expect(job?.data).toEqual({ mediaId: media.id });
    expect(job?.opts.attempts).toBe(3);

    await request(app.getHttpServer()).post(`/media/${media.id}/complete`).expect(409);
  });

  it('refuses a PUT with a different content type than was signed', async () => {
    const { uploadUrl } = await createUpload();

    expect((await put(uploadUrl, 'image/png')).status).toBe(403);
  });

  it('keeps the media pending when the uploaded size does not match', async () => {
    const { media, uploadUrl } = await createUpload(file.length + 1);
    expect((await put(uploadUrl, 'video/mp4')).status).toBe(200);

    const res = await request(app.getHttpServer()).post(`/media/${media.id}/complete`).expect(409);
    expect(res.body.message).toBe(
      `uploaded file is ${file.length} bytes, expected ${file.length + 1}`
    );

    const fetched = await request(app.getHttpServer()).get(`/media/${media.id}`).expect(200);
    expect(fetched.body.status).toBe('pending_upload');
  });

  it('returns 404 for unknown ids and 400 for malformed ones', async () => {
    await request(app.getHttpServer()).get('/media/507f1f77bcf86cd799439011').expect(404);
    await request(app.getHttpServer()).post('/media/507f1f77bcf86cd799439011/complete').expect(404);
    await request(app.getHttpServer()).get('/media/not-an-id').expect(400);
  });
});
