import { IsMongoId } from 'class-validator';

export class MediaIdParamDto {
  @IsMongoId()
  id: string;
}
