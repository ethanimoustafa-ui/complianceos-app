/**
 * Post-test log pull.
 *
 * Run with `tsx tests/e2e/_helpers/pull-logs.ts` (or `npx tsx ...`).
 *
 * Behavior:
 * - If `SUPABASE_ACCESS_TOKEN` is set in env, hits the Supabase Management API to
 *   fetch the last ~100 entries for each of: api, postgrest, auth.
 * - If not set, prints a short notice telling the supervisor to use the MCP
 *   `mcp__supabase__get_logs` tool directly and exits 0.
 *
 * This helper exists because Playwright cannot pull Supabase logs from inside a
 * test (no admin creds in the browser context). The supervisor runs it after a
 * test session to attach a log slice to the run report.
 */

const PROJECT_REF = 'qdbitfgxbnbzkqhdoepd'
const SERVICES = ['api', 'postgrest', 'auth'] as const

async function fetchLogs(service: (typeof SERVICES)[number], token: string): Promise<unknown> {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all?sql=${encodeURIComponent(
    `select id, timestamp, event_message from ${service}_logs order by timestamp desc limit 100`,
  )}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    return { error: `HTTP ${res.status}`, body: await res.text() }
  }
  return res.json()
}

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) {
    console.log(
      'skip — SUPABASE_ACCESS_TOKEN not set; supervisor uses MCP `mcp__supabase__get_logs` directly',
    )
    process.exit(0)
  }
  for (const svc of SERVICES) {
    console.log(`\n=== ${svc} logs (last 100) ===`)
    try {
      const data = await fetchLogs(svc, token)
      console.log(JSON.stringify(data, null, 2))
    } catch (err) {
      console.log(`error pulling ${svc} logs: ${(err as Error).message}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
