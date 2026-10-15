import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CreateUploadDto } from './dto/create-upload.dto';
import { HlsRenditionParamDto } from './dto/hls-rendition-param.dto';
import { MediaIdParamDto } from './dto/media-id-param.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { UploadTicketDto } from './dto/upload-ticket.dto';
import { HLS_PLAYLIST_CONTENT_TYPE } from './media.constants';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('uploads')
  async createUpload(@Body() payload: CreateUploadDto): Promise<UploadTicketDto> {
    return await this.mediaService.createUpload(payload);
  }

  @Get(':id')
  async findOne(@Param() params: MediaIdParamDto): Promise<MediaResponseDto> {
    return await this.mediaService.getById(params.id);
  }

  @Get(':id/hls/master.m3u8')
  @Header('Content-Type', HLS_PLAYLIST_CONTENT_TYPE)
  @Header('Cache-Control', 'private, max-age=60')
  async hlsMaster(@Param() params: MediaIdParamDto): Promise<string> {
    return await this.mediaService.getHlsMasterPlaylist(params.id);
  }

  @Get(':id/hls/:rendition/index.m3u8')
  @Header('Content-Type', HLS_PLAYLIST_CONTENT_TYPE)
  @Header('Cache-Control', 'private, max-age=60')
  async hlsRendition(@Param() params: HlsRenditionParamDto): Promise<string> {
    return await this.mediaService.getHlsRenditionPlaylist(params.id, params.rendition);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param() params: MediaIdParamDto): Promise<MediaResponseDto> {
    return await this.mediaService.completeUpload(params.id);
  }
}
