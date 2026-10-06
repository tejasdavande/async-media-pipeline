import { MediaKind } from './media-kind.enum';

export const ALLOWED_CONTENT_TYPES: Record<string, MediaKind> = {
  'video/mp4': MediaKind.VIDEO,
  'video/quicktime': MediaKind.VIDEO,
  'video/webm': MediaKind.VIDEO,
  'image/jpeg': MediaKind.IMAGE,
  'image/png': MediaKind.IMAGE,
  'image/webp': MediaKind.IMAGE,
};

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

export const UPLOAD_URL_TTL_SECONDS = 15 * 60;

export const IMAGE_PROCESSING_QUEUE = 'image-processing';

export const VIDEO_PROCESSING_QUEUE = 'video-processing';
