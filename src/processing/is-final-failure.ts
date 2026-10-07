import { Job, UnrecoverableError } from 'bullmq';

export function isFinalFailure(job: Job, error: Error): boolean {
  return error instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
}
