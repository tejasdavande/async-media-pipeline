import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateUploadDto } from './dto/create-upload.dto';
import { MediaIdParamDto } from './dto/media-id-param.dto';
import { MediaResponseDto } from './dto/media-response.dto';
import { UploadTicketDto } from './dto/upload-ticket.dto';
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
}
