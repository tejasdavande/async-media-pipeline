import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ConnectionStates } from 'mongoose';

export interface HealthStatus {
  status: 'ok';
  mongo: 'up';
}

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  check(): HealthStatus {
    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException('mongo is not connected');
    }

    return { status: 'ok', mongo: 'up' };
  }
}
