# async-media-pipeline

Async media processing microservice built with NestJS. Clients upload straight to S3 with presigned URLs, and the heavy work (FFmpeg HLS transcoding, Sharp thumbnails) runs in BullMQ workers backed by Redis, with retries and a job-status API to poll.

Work in progress: presigned uploads and the processing queues are in, the workers are next.

## How uploads work

The API never proxies file bytes. `POST /media/uploads` validates the declared content type and size, stores a `pending_upload` record in Mongo, and returns a presigned S3 `PUT` URL valid for 15 minutes. The client uploads the file straight to S3 (or LocalStack locally) with that URL, sending the same `Content-Type` it declared, since the signature covers it.

Once the PUT succeeds, the client calls `POST /media/:id/complete`. The API checks the object actually exists in the bucket with the declared size (`HeadObject`) and moves the record to `uploaded`. The move is a conditional update on the current status, so two concurrent completes can't both win.

It then queues a processing job on BullMQ: videos go to `video-processing`, images to `image-processing`, so slow transcodes can't starve thumbnail jobs and each queue gets its own worker concurrency. The job id is the media id, so a duplicate enqueue is a no-op. Jobs retry 3 times with exponential backoff (10s, 20s, 40s). If Redis is unreachable, the record goes back to `pending_upload` and `complete` returns `503`, so the client can just call it again. The Redis connection has the offline queue disabled, so that failure is immediate instead of the request hanging until Redis comes back.

Accepted types: `video/mp4`, `video/quicktime`, `video/webm`, `image/jpeg`, `image/png`, `image/webp`, up to 2 GB.

## Tech stack

NestJS, TypeScript, MongoDB (Mongoose), BullMQ + Redis, AWS S3 (SDK v3, presigned URLs), LocalStack for local S3, Docker.

## Endpoints

| Method | Route | Description |
|---|---|---|
| GET | `/health` | `200` when Mongo is connected, `503` otherwise |
| POST | `/media/uploads` | body `{ filename, contentType, size }`; returns the media record, a presigned `uploadUrl` and its `expiresAt` |
| POST | `/media/:id/complete` | confirms the object is in S3 with the declared size, marks the record `uploaded` and queues it for processing; `409` if it's missing, the size differs, or it isn't pending; `503` if the job couldn't be queued |
| GET | `/media/:id` | media record with its current `status` |

## Running locally

```bash
cp .env.example .env
docker compose up -d mongo redis localstack
npm install
npm run start:dev
```

Or run everything in containers with `docker compose up --build`. LocalStack serves S3 on http://localhost:4566 and its init hook creates the `media` bucket on startup.

Try an upload:

```bash
curl -s localhost:3000/media/uploads -H 'content-type: application/json' \
  -d '{"filename":"clip.mp4","contentType":"video/mp4","size":1048576}'
# then PUT the file to the returned uploadUrl
curl -X PUT -H 'content-type: video/mp4' --upload-file clip.mp4 "<uploadUrl>"
curl -s -X POST localhost:3000/media/<id>/complete
```

## Tests

```bash
npm test
```

The e2e suite runs the real upload flow (create ticket, PUT to the presigned URL, complete) against Mongo, Redis and LocalStack, so start those first:

```bash
docker compose up -d mongo redis localstack
npm run test:e2e
```

CI runs both suites, with Mongo, Redis and LocalStack as service containers.

## License

MIT
