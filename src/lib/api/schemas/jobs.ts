// Zod schemas for the background-jobs polling endpoint.
//
// Clients receive a `{ jobId }` from any handler that enqueues a job, then
// poll `GET /api/jobs/[jobId]` until `status` is `done` / `failed` / `dead`.

import { z } from 'zod'

export const JobIdParam = z.string().uuid()
