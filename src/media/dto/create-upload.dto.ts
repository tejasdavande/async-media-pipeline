import { IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from '../media.constants';

export class CreateUploadDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  filename: string;

  @IsNotEmpty()
  @IsIn(Object.keys(ALLOWED_CONTENT_TYPES))
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_BYTES)
  size: number;
}
