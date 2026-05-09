/**
 * Slice a list into a single page (1-indexed) and report total page count.
 *
 * Centralizes the `Math.ceil(items.length / pageSize)` + `slice(start, end)`
 * pattern that was previously duplicated across every list page (logs, risks,
 * policies, circulars, advisory, compliance review, ...).
 *
 * Always returns at least 1 total page so paginator UIs can render
 * "Page 1 of 1" for empty datasets.
 *
 * @param items Full list to paginate.
 * @param page 1-indexed current page (will be clamped to [1, totalPages]).
 * @param pageSize Items per page (must be > 0).
 */
export interface PageResult<T> {
  items: T[]
  totalPages: number
  page: number
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageResult<T> {
  const safeSize = Math.max(1, Math.floor(pageSize))
  const totalPages = Math.max(1, Math.ceil(items.length / safeSize))
  const safePage = Math.min(Math.max(1, Math.floor(page)), totalPages)
  const start = (safePage - 1) * safeSize
  return {
    items: items.slice(start, start + safeSize),
    totalPages,
    page: safePage,
  }
}
