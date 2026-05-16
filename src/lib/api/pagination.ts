// Pagination parsing — defaults page=1, pageSize=10 (BACKEND-API-MAP §10).
// Clamps `pageSize` to <= 100 to bound query cost.

export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100

export interface PaginationParams {
  page: number
  pageSize: number
  /** Zero-based offset for `range(offset, offset + pageSize - 1)` in Supabase. */
  offset: number
}

export function parsePagination(searchParams: URLSearchParams): PaginationParams {
  const rawPage = Number(searchParams.get('page') ?? '1')
  const rawSize = Number(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE))
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(MAX_PAGE_SIZE, Math.floor(rawSize))
    : DEFAULT_PAGE_SIZE
  return { page, pageSize, offset: (page - 1) * pageSize }
}

/**
 * Helper to convert (page, pageSize) into Supabase `.range()` bounds (inclusive).
 */
export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return [from, to]
}
