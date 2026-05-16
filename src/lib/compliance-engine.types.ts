// Re-export shim — the engine + types moved to the server-side scoring
// directory as part of Phase 6. Frontend imports continue to work via
// `@/lib/compliance-engine.types`.
export * from '@/lib/api/services/scoring/compliance-engine.types'
