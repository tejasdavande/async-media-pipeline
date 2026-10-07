import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { basename, isAbsolute, join } from 'path';
import { promisify } from 'util';
import { Rendition } from './hls-ladder';

const execFileAsync = promisify(execFile);

export const HLS_SEGMENT_SECONDS = 6;
export const HLS_MASTER_PLAYLIST = 'master.m3u8';

const FFMPEG_TIMEOUT_MS = 60 * 60 * 1000;

export interface VideoProbe {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

interface ProbeStream {
  codec_type: string;
  width?: number;
  height?: number;
  disposition?: { attached_pic?: number };
  side_data_list?: { rotation?: number }[];
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: { duration?: string };
}

@Injectable()
export class FfmpegService {
  async probe(input: string): Promise<VideoProbe> {
    const output = await this.run('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      input,
    ]);
    const { streams = [], format } = JSON.parse(output) as ProbeOutput;

    const video = streams.find(
      (stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic
    );
    if (!video?.width || !video.height) {
      throw new Error('no video stream');
    }

    const duration = Number(format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('unknown duration');
    }

    const rotation = video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation;
    const sideways = Math.abs(rotation ?? 0) % 180 === 90;

    return {
      width: sideways ? video.height : video.width,
      height: sideways ? video.width : video.height,
      duration,
      hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
    };
  }

  async transcodeHls(
    input: string,
    outputDir: string,
    probe: VideoProbe,
    renditions: Rendition[]
  ): Promise<void> {
    const landscape = probe.width >= probe.height;
    const splits = renditions.map((_, i) => `[v${i}]`).join('');
    const scales = renditions.map(
      (rendition, i) =>
        `[v${i}]scale=${landscape ? `-2:${rendition.size}` : `${rendition.size}:-2`}[v${i}out]`
    );

    const videoOutputs = renditions.flatMap((rendition, i) => [
      '-map',
      `[v${i}out]`,
      `-b:v:${i}`,
      `${rendition.videoBitrate}k`,
      `-maxrate:v:${i}`,
      `${Math.round(rendition.videoBitrate * 1.07)}k`,
      `-bufsize:v:${i}`,
      `${rendition.videoBitrate * 2}k`,
    ]);
    const audioOutputs = probe.hasAudio
      ? [...renditions.flatMap(() => ['-map', '0:a:0']), '-c:a', 'aac', '-b:a', '128k', '-ac', '2']
      : [];
    const streamMap = renditions
      .map((rendition, i) => `v:${i},${probe.hasAudio ? `a:${i},` : ''}name:${rendition.name}`)
      .join(' ');

    await this.run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostats',
      '-y',
      '-i',
      input,
      '-filter_complex',
      `[0:v]split=${renditions.length}${splits};${scales.join(';')}`,
      ...videoOutputs,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-force_key_frames',
      `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`,
      '-sc_threshold',
      '0',
      ...audioOutputs,
      '-f',
      'hls',
      '-hls_time',
      String(HLS_SEGMENT_SECONDS),
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      join(outputDir, '%v', 'segment_%03d.ts'),
      '-master_pl_name',
      HLS_MASTER_PLAYLIST,
      '-var_stream_map',
      streamMap,
      join(outputDir, '%v', 'index.m3u8'),
    ]);
  }

  async extractFrame(input: string, output: string, atSeconds: number): Promise<void> {
    await this.run('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      atSeconds.toFixed(3),
      '-i',
      input,
      '-frames:v',
      '1',
      output,
    ]);
  }

  private async run(command: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync(command, args, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: FFMPEG_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });

      return stdout;
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim();
      let reason = (stderr ? stderr.split('\n').pop() : undefined) ?? (error as Error).message;
      for (const path of args.filter((arg) => isAbsolute(arg))) {
        reason = reason.replaceAll(path, basename(path));
      }
      throw new Error(`${command} failed: ${reason}`);
    }
  }
}
