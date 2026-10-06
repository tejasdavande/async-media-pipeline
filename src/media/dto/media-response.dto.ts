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
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;

  static fromSchema(media: Media): MediaResponseDto {
    return {
      id: media._id.toString(),
      filename: media.filename,
      contentType: media.contentType,
      kind: media.kind,
      size: media.size,
      status: media.status,
      width: media.width,
      height: media.height,
      failureReason: media.failureReason,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };
  }
}
