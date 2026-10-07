import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { FfmpegService } from './ffmpeg.service';
import { pickRenditions } from './hls-ladder';

describe('FfmpegService', () => {
  const service = new FfmpegService();
  let dir: string;

  const clip = (name: string, args: string[]) => {
    const path = join(dir, name);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, path]);

    return path;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ffmpeg-spec-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('probe', () => {
    it('reads size, duration and audio from a clip', async () => {
      const input = clip('av.mp4', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=2:size=1280x720:rate=24',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=2',
        '-pix_fmt',
        'yuv420p',
        '-shortest',
      ]);

      const probe = await service.probe(input);

      expect(probe).toEqual(expect.objectContaining({ width: 1280, height: 720, hasAudio: true }));
      expect(probe.duration).toBeCloseTo(2, 0);
    });

    it('swaps width and height for video recorded sideways', async () => {
      const landscape = clip('landscape.mp4', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=640x360:rate=24',
        '-pix_fmt',
        'yuv420p',
      ]);
      const rotated = clip('rotated.mp4', ['-display_rotation', '90', '-i', landscape, '-c', 'copy']);

      expect(await service.probe(rotated)).toEqual(
        expect.objectContaining({ width: 360, height: 640, hasAudio: false })
      );
    });

    it('fails on a file that is not a video', async () => {
      const input = join(dir, 'junk.mp4');
      writeFileSync(input, 'not a video');

      const probe = service.probe(input);

      await expect(probe).rejects.toThrow(/^ffprobe failed: junk.mp4: /);
      await expect(probe).rejects.not.toThrow(dir);
    });
  });

  it('transcodes to an hls ladder with a master playlist', async () => {
    const input = clip('hd.mp4', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=1280x720:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=2',
      '-pix_fmt',
      'yuv420p',
      '-shortest',
    ]);
    const probe = await service.probe(input);
    const output = join(dir, 'hls');

    await service.transcodeHls(input, output, probe, pickRenditions(probe.width, probe.height));

    const master = readFileSync(join(output, 'master.m3u8'), 'utf8');
    expect(master).toContain('RESOLUTION=1280x720');
    expect(master).toContain('RESOLUTION=854x480');
    expect(master).toContain('mp4a');
    expect(readdirSync(join(output, '720p'))).toEqual(
      expect.arrayContaining(['index.m3u8', 'segment_000.ts'])
    );
    expect(readdirSync(join(output, '480p'))).toEqual(
      expect.arrayContaining(['index.m3u8', 'segment_000.ts'])
    );
  });

  it('extracts a frame as an image', async () => {
    const input = clip('frame.mp4', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x240:rate=24',
      '-pix_fmt',
      'yuv420p',
    ]);
    const output = join(dir, 'poster.png');

    await service.extractFrame(input, output, 0.5);

    expect(await sharp(output).metadata()).toEqual(
      expect.objectContaining({ format: 'png', width: 320, height: 240 })
    );
  });
});
