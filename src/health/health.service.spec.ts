import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const serviceWith = (readyState: ConnectionStates) =>
    new HealthService({ readyState } as Connection);

  it('reports ok when mongo is connected', () => {
    expect(serviceWith(ConnectionStates.connected).check()).toEqual({ status: 'ok', mongo: 'up' });
  });

  it('throws 503 when mongo is not connected', () => {
    expect(() => serviceWith(ConnectionStates.disconnected).check()).toThrow(
      ServiceUnavailableException
    );
  });
});
