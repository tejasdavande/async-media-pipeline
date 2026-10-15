import { MediaKind } from '../media-kind.enum';
import { MediaStatus } from '../media-status.enum';
import { Media } from '../schemas/media.schema';

export class MediaResponseDto {
  id: string;
  filename: string;
  contentType: string;
  kind: MediaKind;
  size: number;
  status: MediaStatus;
  width?: number;
  height?: number;
  duration?: number;
  failureReason?: string;
  thumbnailUrl?: string;
  playbackUrl?: string;
  createdAt: Date;
  updatedAt: Date;

  static fromSchema(media: Media, thumbnailUrl?: string): MediaResponseDto {
    const id = media._id.toString();

    return {
      id,
      filename: media.filename,
      contentType: media.contentType,
      kind: media.kind,
      size: media.size,
      status: media.status,
      width: media.width,
      height: media.height,
      duration: media.duration,
      failureReason: media.failureReason,
      thumbnailUrl,
      playbackUrl: media.hlsKey ? `/media/${id}/hls/master.m3u8` : undefined,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }
}
