import type { Page, ConsoleMessage } from '@playwright/test'

const PROJECT_REF = 'qdbitfgxbnbzkqhdoepd'

export interface RouteMetrics {
  route: string
  totalRequests: number
  apiRequests: number          // /api/* on localhost
  supabaseRequests: number     // *.supabase.co/{rest|auth|storage}
  countedRequests: number      // apiRequests + supabaseRequests
  byPath: Record<string, number>
  ttfp: number | null          // approx first-paint ms from performance.timing
  domContentLoaded: number | null
  loadEvent: number | null
  consoleErrors: string[]
  consoleWarnings: string[]
  httpErrors: { status: number; url: string }[]
  loadingTextSeen: boolean
  skeletonsSeen: boolean
}

export interface Measurement {
  start: () => void
  stop: () => RouteMetrics
  setRoute: (r: string) => void
}

/**
 * Returns a request/console capture helper bound to `page`.
 * Call start() before navigating, then stop() once the page has settled.
 * setRoute() updates the route label embedded in the returned metrics.
 */
export function attachMeasure(page: Page): Measurement {
  let route = ''
  const consoleErrors: string[] = []
  const consoleWarnings: string[] = []
  const httpErrors: { status: number; url: string }[] = []
  const byPath: Record<string, number> = {}
  let totalRequests = 0
  let apiRequests = 0
  let supabaseRequests = 0

  function onRequest(req: import('@playwright/test').Request): void {
    totalRequests += 1
    const url = req.url()
    let counted = false
    if (url.includes(`${PROJECT_REF}.supabase.co/rest/v1/`)) {
      supabaseRequests += 1
      counted = true
    } else if (url.includes(`${PROJECT_REF}.supabase.co/auth/v1/`)) {
      supabaseRequests += 1
      counted = true
    } else if (url.includes(`${PROJECT_REF}.supabase.co/storage/v1/`)) {
      supabaseRequests += 1
      counted = true
    } else if (/^https?:\/\/localhost:3000\/api\//.test(url)) {
      apiRequests += 1
      counted = true
    }
    if (counted) {
      try {
        const u = new URL(url)
        byPath[u.pathname] = (byPath[u.pathname] || 0) + 1
      } catch {
        byPath[url] = (byPath[url] || 0) + 1
      }
    }
  }

  function onConsole(msg: ConsoleMessage): void {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
    if (msg.type() === 'warning') consoleWarnings.push(msg.text())
  }

  function onResponse(r: import('@playwright/test').Response): void {
    const s = r.status()
    if (s >= 400) httpErrors.push({ status: s, url: r.url() })
  }

  return {
    setRoute(r: string) {
      route = r
    },
    start() {
      page.on('request', onRequest)
      page.on('console', onConsole)
      page.on('response', onResponse)
    },
    stop(): RouteMetrics {
      page.off('request', onRequest)
      page.off('console', onConsole)
      page.off('response', onResponse)
      return {
        route,
        totalRequests,
        apiRequests,
        supabaseRequests,
        countedRequests: apiRequests + supabaseRequests,
        byPath,
        ttfp: null,
        domContentLoaded: null,
        loadEvent: null,
        consoleErrors: [...consoleErrors],
        consoleWarnings: [...consoleWarnings],
        httpErrors: [...httpErrors],
        loadingTextSeen: false,
        skeletonsSeen: false,
      }
    },
  }
}

/**
 * Read performance.timing milestones from the live page.
 * All values are offsets in ms from navigationStart.
 */
export async function readPerfTiming(page: Page): Promise<{
  ttfp: number | null
  domContentLoaded: number | null
  loadEvent: number | null
}> {
  try {
    return await page.evaluate(() => {
      const t = performance.timing
      const navStart = t.navigationStart || 0
      const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[]
      const fp = paintEntries.find((p) => p.name === 'first-paint')
      return {
        ttfp: fp ? Math.round(fp.startTime) : null,
        domContentLoaded:
          t.domContentLoadedEventEnd > 0 ? t.domContentLoadedEventEnd - navStart : null,
        loadEvent: t.loadEventEnd > 0 ? t.loadEventEnd - navStart : null,
      }
    })
  } catch {
    return { ttfp: null, domContentLoaded: null, loadEvent: null }
  }
}

/**
 * Quick visual probes — best-effort and tolerant of timing variance.
 */
export async function probeUiArtifacts(page: Page): Promise<{
  loadingTextSeen: boolean
  skeletonsSeen: boolean
}> {
  let loadingTextSeen = false
  let skeletonsSeen = false
  try {
    // Pages should use skeletons, NOT bare "Loading..." text.
    const text = await page.content()
    loadingTextSeen = /\bLoading\.\.\./i.test(text)
    skeletonsSeen =
      (await page.locator('[class*="skeleton" i], [data-testid*="skeleton" i]').count()) > 0 ||
      /animate-pulse/.test(text)
  } catch {
    /* ignore */
  }
  return { loadingTextSeen, skeletonsSeen }
}
