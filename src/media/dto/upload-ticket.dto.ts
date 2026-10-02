import { MediaResponseDto } from './media-response.dto';

export class UploadTicketDto {
  media: MediaResponseDto;
  uploadUrl: string;
  expiresAt: Date;
}
