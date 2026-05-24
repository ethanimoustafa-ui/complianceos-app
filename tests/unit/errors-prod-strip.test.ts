// W17-V1 (SEC-7): in production NODE_ENV, `handle()` must NOT echo the
// `details` payload of a `validation_failed` error back to the client. In
// development the details must still flow through so devs see the Zod issues.
//
// We test `handle()` directly by importing it, mutating `process.env.NODE_ENV`
// at the test boundary, and parsing the JSON body of the returned NextResponse.

import { describe, it, expect, afterEach } from 'vitest'
import { handle, ValidationFailed } from '@/lib/api/errors'

const ORIGINAL_ENV = process.env.NODE_ENV

async function bodyOf(res: Response): Promise<unknown> {
  return (await res.json()) as unknown
}

// `process.env.NODE_ENV` is sometimes defined as a read-only property in
// modern Node + Vitest; assigning to it directly works but `defineProperty`
// throws. We assign and restore the simple way.
function setEnv(value: string | undefined): void {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>).NODE_ENV
  } else {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = value
  }
}

describe('handle() — validation_failed details stripping', () => {
  afterEach(() => {
    setEnv(ORIGINAL_ENV)
  })

  it('strips `details` in production', async () => {
    setEnv('production')

    const err = ValidationFailed([
      { code: 'invalid_type', path: ['authority'], message: 'Expected string' },
    ])
    const res = handle(err)
    const body = (await bodyOf(res)) as { error: { code: string; details?: unknown } }

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
    // The critical assertion: no `details` echoed in prod.
    expect(body.error.details).toBeUndefined()
  })

  it('keeps `details` in development', async () => {
    setEnv('development')

    const detailsPayload = [
      { code: 'invalid_type', path: ['authority'], message: 'Expected string' },
    ]
    const err = ValidationFailed(detailsPayload)
    const res = handle(err)
    const body = (await bodyOf(res)) as { error: { code: string; details?: unknown } }

    expect(res.status).toBe(400)
    expect(body.error.code).toBe('validation_failed')
    expect(body.error.details).toEqual(detailsPayload)
  })

  it('keeps `details` in test (non-production) as well', async () => {
    setEnv('test')
    const err = ValidationFailed([{ path: ['title'], message: 'Required' }])
    const res = handle(err)
    const body = (await bodyOf(res)) as { error: { details?: unknown } }
    expect(body.error.details).toBeDefined()
  })
})
