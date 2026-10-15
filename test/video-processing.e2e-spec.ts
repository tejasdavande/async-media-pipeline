import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MediaStatus } from '../src/media/media-status.enum';
import { VIDEO_PROCESSING_QUEUE } from '../src/media/media.constants';
import { MediaRepository } from '../src/media/media.repository';

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

    expect(media.playbackUrl).toBe(`/media/${id}/hls/master.m3u8`);
    const master = await request(app.getHttpServer()).get(media.playbackUrl).expect(200);
    expect(master.headers['content-type']).toMatch(/^application\/vnd\.apple\.mpegurl/);
    expect(master.text).toContain('720p/index.m3u8');
    expect(master.text).toContain('480p/index.m3u8');

    for (const rendition of ['720p', '480p']) {
      const playlist = await request(app.getHttpServer())
        .get(`/media/${id}/hls/${rendition}/index.m3u8`)
        .expect(200);
      expect(playlist.text).toContain('#EXT-X-ENDLIST');
      expect(playlist.text).not.toMatch(/^segment_/m);

      const segmentUrls = playlist.text.split('\n').filter((line) => line.startsWith('http'));
      expect(segmentUrls).toHaveLength(1);
      const segment = await fetch(segmentUrls[0]);
      expect(segment.status).toBe(200);
      expect(segment.headers.get('content-type')).toBe('video/mp2t');
      expect((await segment.arrayBuffer()).byteLength).toBeGreaterThan(0);

      const other = rendition === '720p' ? '480p' : '720p';
      const tampered = await fetch(segmentUrls[0].replace(`/${rendition}/`, `/${other}/`));
      expect(tampered.status).toBe(403);
    }

    await request(app.getHttpServer()).get(`/media/${id}/hls/1080p/index.m3u8`).expect(404);
    await request(app.getHttpServer()).get(`/media/${id}/hls/abc/index.m3u8`).expect(400);

    const download = await fetch(media.thumbnailUrl);
    expect(download.status).toBe(200);
    const thumbnail = Buffer.from(await download.arrayBuffer());
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

  it('fails a job whose source file is gone on the first attempt', async () => {
    const ticket = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', size: 1024 })
      .expect(201);
    const id = ticket.body.media.id as string;

    await app
      .get(MediaRepository)
      .transitionStatus(id, MediaStatus.PENDING_UPLOAD, MediaStatus.UPLOADED);
    const queue = app.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));
    await queue.add('video', { mediaId: id }, { jobId: id });

    const media = await waitForStatus(id, ['ready', 'failed']);

    expect(media.status).toBe('failed');
    expect(media.failureReason).toBe('source file is missing from storage');
    expect((await queue.getJob(id))?.attemptsMade).toBe(1);
  }, 30_000);
});
