import 'reflect-metadata';
import { validate } from './env.validator';

describe('validate', () => {
  const base = {
    PORT: '3000',
    MONGO_URI: 'mongodb://localhost:27017/media_pipeline',
    REDIS_HOST: 'localhost',
    S3_BUCKET: 'media',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  };

  it.each([
    ['true', true],
    ['false', false],
    ['0', false],
  ])('parses S3_FORCE_PATH_STYLE=%s as %s', (raw, expected) => {
    expect(validate({ ...base, S3_FORCE_PATH_STYLE: raw }).S3_FORCE_PATH_STYLE).toBe(expected);
  });

  it('rejects a missing bucket', () => {
    expect(() => validate({ ...base, S3_BUCKET: undefined })).toThrow();
  });
});
