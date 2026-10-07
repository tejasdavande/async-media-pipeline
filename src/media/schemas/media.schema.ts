import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MediaKind } from '../media-kind.enum';
import { MediaStatus } from '../media-status.enum';

export type MediaDocument = HydratedDocument<Media>;

@Schema({ timestamps: true, collection: 'media' })
export class Media {
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true })
  sourceKey: string;

  @Prop({ required: true })
  filename: string;

  @Prop({ required: true })
  contentType: string;

  @Prop({ required: true, enum: MediaKind })
  kind: MediaKind;

  @Prop({ required: true })
  size: number;

  @Prop({ required: true, enum: MediaStatus, default: MediaStatus.PENDING_UPLOAD, index: true })
  status: MediaStatus;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  @Prop()
  duration?: number;

  @Prop()
  thumbnailKey?: string;

  @Prop()
  hlsKey?: string;

  @Prop()
  failureReason?: string;

  createdAt: Date;

  updatedAt: Date;
}

export const MediaSchema = SchemaFactory.createForClass(Media);
