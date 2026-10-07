import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { FfmpegService } from './ffmpeg.service';
import { ImageProcessingService } from './image-processing.service';
import { ImageProcessor } from './image.processor';
import { VideoProcessingService } from './video-processing.service';
import { VideoProcessor } from './video.processor';

@Module({
  imports: [MediaModule, StorageModule],
  providers: [
    ImageProcessor,
    ImageProcessingService,
    VideoProcessor,
    VideoProcessingService,
    FfmpegService,
  ],
})
export class ProcessingModule {}
