import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageModule } from '../storage/storage.module';
import { IMAGE_PROCESSING_QUEUE, VIDEO_PROCESSING_QUEUE } from './media.constants';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { Media, MediaSchema } from './schemas/media.schema';

const processingJobDefaults = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
    BullModule.registerQueue(
      { name: IMAGE_PROCESSING_QUEUE, defaultJobOptions: processingJobDefaults },
      { name: VIDEO_PROCESSING_QUEUE, defaultJobOptions: processingJobDefaults }
    ),
    StorageModule,
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaRepository],
  exports: [MediaService],
})
export class MediaModule {}
