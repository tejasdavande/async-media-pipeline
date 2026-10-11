import { ServiceUnavailableException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthService, REDIS_CHECK_TIMEOUT_MS } from './health.service';

describe('HealthService', () => {
  let info: jest.Mock;

  const serviceWith = (readyState: ConnectionStates, client?: Promise<unknown>) =>
    new HealthService(
      { readyState } as Connection,
      { client: client ?? Promise.resolve({ info }) } as unknown as Queue
    );

  beforeEach(() => {
    info = jest.fn().mockResolvedValue('redis_version:7.4.0');
  });

  afterEach(() => jest.useRealTimers());

  it('reports ok when mongo and redis are up', async () => {
    await expect(serviceWith(ConnectionStates.connected).check()).resolves.toEqual({
      status: 'ok',
      mongo: 'up',
      redis: 'up',
    });
  });

  it('throws 503 when mongo is not connected', async () => {
    await expect(serviceWith(ConnectionStates.disconnected).check()).rejects.toThrow(
      new ServiceUnavailableException('mongo is not connected')
    );
  });

  it('throws 503 when the redis round trip fails', async () => {
    info.mockRejectedValue(new Error("Stream isn't writeable"));

    await expect(serviceWith(ConnectionStates.connected).check()).rejects.toThrow(
      new ServiceUnavailableException('redis is not reachable')
    );
  });

  it('throws 503 instead of hanging when redis never becomes ready', async () => {
    jest.useFakeTimers();

    const result = serviceWith(ConnectionStates.connected, new Promise(() => {})).check();
    jest.advanceTimersByTime(REDIS_CHECK_TIMEOUT_MS);

    await expect(result).rejects.toThrow(new ServiceUnavailableException('redis is not reachable'));
  });
});
