import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MediaStatus } from '../src/media/media-status.enum';
import { IMAGE_PROCESSING_QUEUE } from '../src/media/media.constants';
import { MediaRepository } from '../src/media/media.repository';
import { setupApp } from '../src/setup-app';

describe('Image processing (e2e)', () => {
  let app: INestApplication;

  const uploadAndComplete = async (body: Buffer) => {
    const ticket = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'photo.png', contentType: 'image/png', size: body.length })
      .expect(201);
    const { media, uploadUrl } = ticket.body as { media: { id: string }; uploadUrl: string };

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array(body),
    });
    expect(put.status).toBe(200);

    await request(app.getHttpServer()).post(`/media/${media.id}/complete`).expect(200);

    return media.id;
  };

  const waitForStatus = async (id: string, statuses: string[]) => {
    for (let i = 0; i < 50; i++) {
      const res = await request(app.getHttpServer()).get(`/media/${id}`).expect(200);
      if (statuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`media ${id} never reached ${statuses.join('/')}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a thumbnail and marks the image ready', async () => {
    const png = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();

    const id = await uploadAndComplete(png);
    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media).toEqual(expect.objectContaining({ status: 'ready', width: 1200, height: 800 }));
    expect(media.thumbnailKey).toBeUndefined();

    const download = await fetch(media.thumbnailUrl);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('image/webp');
    const otherKey = await fetch(media.thumbnailUrl.replace(`thumbnails/${id}.webp`, 'uploads/x'));
    expect(otherKey.status).toBe(403);
    const thumbnail = Buffer.from(await download.arrayBuffer());
    expect(await sharp(thumbnail).metadata()).toEqual(
      expect.objectContaining({ format: 'webp', width: 320, height: 213 })
    );
  });

  it('fails a file that is not really an image without retrying', async () => {
    const id = await uploadAndComplete(Buffer.from('not a png at all'));
    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media.status).toBe('failed');
    expect(media.failureReason).toMatch(/^could not decode image/);
  });

  it('fails a job whose source file is gone on the first attempt', async () => {
    const ticket = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'photo.png', contentType: 'image/png', size: 1024 })
      .expect(201);
    const id = ticket.body.media.id as string;

    await app
      .get(MediaRepository)
      .transitionStatus(id, MediaStatus.PENDING_UPLOAD, MediaStatus.UPLOADED);
    const queue = app.get<Queue>(getQueueToken(IMAGE_PROCESSING_QUEUE));
    await queue.add('image', { mediaId: id }, { jobId: id });

    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media.status).toBe('failed');
    expect(media.failureReason).toBe('source file is missing from storage');
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
  });
});
