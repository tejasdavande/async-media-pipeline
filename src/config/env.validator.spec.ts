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

  it('splits CORS_ORIGINS on commas', () => {
    expect(
      validate({ ...base, CORS_ORIGINS: 'http://localhost:5173, https://player.example.com' })
        .CORS_ORIGINS
    ).toEqual(['http://localhost:5173', 'https://player.example.com']);
  });

  it('leaves CORS_ORIGINS undefined when unset', () => {
    expect(validate(base).CORS_ORIGINS).toBeUndefined();
  });

  it.each(['https://player.example.com/', 'player.example.com', 'https://example.com/app'])(
    'rejects CORS origin %s',
    (origin) => {
      expect(() => validate({ ...base, CORS_ORIGINS: origin })).toThrow();
    }
  );
});
