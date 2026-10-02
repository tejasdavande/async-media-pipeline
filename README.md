# async-media-pipeline

Async media processing microservice built with NestJS. Clients upload straight to S3 with presigned URLs, and the heavy work (FFmpeg HLS transcoding, Sharp thumbnails) runs in BullMQ workers backed by Redis, with retries and a job-status API to poll.

Work in progress: right now it's the service skeleton, Mongo connection and a health check.

## Tech stack

NestJS, TypeScript, MongoDB (Mongoose), Docker.

## Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/health` | `200` when Mongo is connected, `503` otherwise |

## Running locally

```bash
cp .env.example .env
docker compose up -d mongo
npm install
npm run start:dev
```

Or run everything in containers with `docker compose up --build`.

## Tests

```bash
npm test
```

## License

MIT
