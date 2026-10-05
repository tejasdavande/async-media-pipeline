import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MediaStatus } from './media-status.enum';
import { Media } from './schemas/media.schema';

@Injectable()
export class MediaRepository {
  constructor(@InjectModel(Media.name) private readonly mediaModel: Model<Media>) {}

  async create(
    media: Pick<Media, 'sourceKey' | 'filename' | 'contentType' | 'kind' | 'size'>
  ): Promise<Media> {
    const created = await this.mediaModel.create(media);

    return created.toObject();
  }

  async findById(id: string): Promise<Media | null> {
    return await this.mediaModel.findById(id).lean();
  }

  async transitionStatus(id: string, from: MediaStatus, to: MediaStatus): Promise<Media | null> {
    return await this.mediaModel
      .findOneAndUpdate({ _id: id, status: from }, { status: to }, { new: true })
      .lean();
  }
}
