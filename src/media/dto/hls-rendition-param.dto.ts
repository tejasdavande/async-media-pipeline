import { Matches } from 'class-validator';
import { MediaIdParamDto } from './media-id-param.dto';

export class HlsRenditionParamDto extends MediaIdParamDto {
  @Matches(/^\d+p$/)
  rendition: string;
}
