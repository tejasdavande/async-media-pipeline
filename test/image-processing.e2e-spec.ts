import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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

    const thumbnail = await app.get(StorageService).getObject(`thumbnails/${id}.webp`);
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
});
