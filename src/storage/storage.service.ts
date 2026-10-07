import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.getOrThrow<string>('S3_REGION'),
      endpoint: config.get<string>('S3_ENDPOINT'),
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE') ?? false,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(this.client, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type']),
    });
  }

  async getObjectSize(key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));

      return head.ContentLength ?? null;
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!object.Body) {
      throw new Error(`object ${key} has no body`);
    }

    return Buffer.from(await object.Body.transformToByteArray());
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    );
  }

  async downloadToFile(key: string, path: string): Promise<void> {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!(object.Body instanceof Readable)) {
      throw new Error(`object ${key} has no body`);
    }

    await pipeline(object.Body, createWriteStream(path));
  }

  async uploadFile(key: string, path: string, contentType: string): Promise<void> {
    const { size } = await stat(path);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(path),
        ContentType: contentType,
        ContentLength: size,
      })
    );
  }
}
