import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';

describe('Video processing (e2e)', () => {
  let app: INestApplication;
  let dir: string;

  const uploadAndComplete = async (body: Buffer) => {
    const ticket = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', size: body.length })
      .expect(201);
    const { media, uploadUrl } = ticket.body as { media: { id: string }; uploadUrl: string };

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: new Uint8Array(body),
    });
    expect(put.status).toBe(200);

    await request(app.getHttpServer()).post(`/media/${media.id}/complete`).expect(200);

    return media.id;
  };

  const waitForStatus = async (id: string, statuses: string[]) => {
    for (let i = 0; i < 100; i++) {
      const res = await request(app.getHttpServer()).get(`/media/${id}`).expect(200);
      if (statuses.includes(res.body.status)) {
        return res.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`media ${id} never reached ${statuses.join('/')}`);
  };

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'video-e2e-'));

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('transcodes a clip to hls and marks it ready', async () => {
    const clip = join(dir, 'clip.mp4');
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=duration=3:size=1280x720:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
      clip,
    ]);

    const id = await uploadAndComplete(readFileSync(clip));
    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media).toEqual(expect.objectContaining({ status: 'ready', width: 1280, height: 720 }));
    expect(media.duration).toBeCloseTo(3, 0);
    expect(media.hlsKey).toBeUndefined();

    const storage = app.get(StorageService);
    const master = (await storage.getObject(`hls/${id}/master.m3u8`)).toString();
    expect(master).toContain('720p/index.m3u8');
    expect(master).toContain('480p/index.m3u8');

    for (const rendition of ['720p', '480p']) {
      const playlist = (await storage.getObject(`hls/${id}/${rendition}/index.m3u8`)).toString();
      expect(playlist).toContain('#EXT-X-ENDLIST');
      expect(await storage.getObjectSize(`hls/${id}/${rendition}/segment_000.ts`)).toBeGreaterThan(
        0
      );
    }

    const thumbnail = await storage.getObject(`thumbnails/${id}.webp`);
    expect(await sharp(thumbnail).metadata()).toEqual(
      expect.objectContaining({ format: 'webp', width: 320, height: 180 })
    );
  }, 30_000);

  it('fails a file that is not really a video without retrying', async () => {
    const id = await uploadAndComplete(Buffer.from('not an mp4 at all'));
    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media.status).toBe('failed');
    expect(media.failureReason).toMatch(/^could not read video: ffprobe failed: source: /);
  }, 30_000);
});
