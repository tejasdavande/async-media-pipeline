import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/setup-app';

describe('CORS (e2e)', () => {
  let app: INestApplication;
  const origin = 'http://player.test';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers preflight for an allowed origin', async () => {
    const res = await request(app.getHttpServer())
      .options('/media/uploads')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(origin);
    expect(res.headers['access-control-allow-headers']).toBe('content-type');
  });

  it('does not allow other origins', async () => {
    const res = await request(app.getHttpServer()).get('/health').set('Origin', 'http://evil.test');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('lets a browser PUT to the presigned upload url', async () => {
    const created = await request(app.getHttpServer())
      .post('/media/uploads')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', size: 1024 })
      .expect(201);

    const res = await fetch(created.body.uploadUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT');
  });
});
