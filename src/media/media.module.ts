import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageModule } from '../storage/storage.module';
import { MediaController } from './media.controller';
import { MediaRepository } from './media.repository';
import { MediaService } from './media.service';
import { Media, MediaSchema } from './schemas/media.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]), StorageModule],
  controllers: [MediaController],
  providers: [MediaService, MediaRepository],
  exports: [MediaService],
})
export class MediaModule {}
