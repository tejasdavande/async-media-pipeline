import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { ImageProcessingService } from './image-processing.service';
import { ImageProcessor } from './image.processor';

@Module({
  imports: [MediaModule, StorageModule],
  providers: [ImageProcessor, ImageProcessingService],
})
export class ProcessingModule {}
