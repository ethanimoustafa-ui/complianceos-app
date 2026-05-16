// Re-export shim — moved to server-side scoring dir in Phase 6.
// Use `useDashboardHealth` for client-side consumption (hits
// `/api/compliance/dashboard-health`); direct importers of the pure function
// (e.g. tests) still work via this shim.
export * from '@/lib/api/services/scoring/dashboard-health'
