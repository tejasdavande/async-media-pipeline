import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';
import { IMAGE_PROCESSING_QUEUE } from '../media/media.constants';

export const REDIS_CHECK_TIMEOUT_MS = 1000;

export interface HealthStatus {
  status: 'ok';
  mongo: 'up';
  redis: 'up';
}

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectQueue(IMAGE_PROCESSING_QUEUE) private readonly queue: Queue
  ) {}

  async check(): Promise<HealthStatus> {
    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException('mongo is not connected');
    }
    if (!(await this.isRedisUp())) {
      throw new ServiceUnavailableException('redis is not reachable');
    }

    return { status: 'ok', mongo: 'up', redis: 'up' };
  }

  private async isRedisUp(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timed out')), REDIS_CHECK_TIMEOUT_MS);
    });

    try {
      await Promise.race([this.queue.client.then((client) => client.info()), timeout]);

      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
