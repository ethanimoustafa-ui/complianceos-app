/**
 * Format a byte count as a short human-readable string.
 *
 * Centralizes the `bytes < 1024 * 1024 ? KB : MB` arithmetic that was
 * previously duplicated across file-upload and attachment surfaces.
 *
 * Examples:
 *   formatBytes(900)            // "900 B"
 *   formatBytes(1500)           // "1.5 KB"
 *   formatBytes(1500, 0)        // "1 KB"
 *   formatBytes(2_500_000)      // "2.4 MB"
 *
 * @param bytes Byte count.
 * @param decimals Number of decimal places (default 1).
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`
}
