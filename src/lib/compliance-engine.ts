// Re-export shim — the engine moved to the server-side scoring directory as
// part of Phase 6. The frontend should not import this directly any more;
// use `useComplianceScore` (which calls `/api/compliance/score`). This shim
// stays so a couple of legacy type imports still resolve.
export * from '@/lib/api/services/scoring/compliance-engine'
