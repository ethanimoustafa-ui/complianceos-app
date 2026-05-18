// Cache tag factories + revalidation helper.
//
// Use `cacheTags.audits(id?)` instead of typing string literals. Mutation
// handlers call `revalidate(tag)` (which wraps `revalidateTag` from
// `next/cache`) after a successful write.
//
// Stage B agents: extend the factories below for the 15 resource families
// already enumerated in BACKEND-API-MAP §13 cache-tags table.

import { revalidateTag } from 'next/cache'

type TagFactory = (id?: string) => string

function makeFactory(prefix: string): TagFactory {
  return (id) => (id ? `${prefix}:${id}` : `${prefix}:list`)
}

export const cacheTags = {
  audits: makeFactory('audits'),
  auditTasks: (auditId: string) => `audits:${auditId}:tasks`,
  auditLogs: (auditId: string) => `audits:${auditId}:logs`,
  auditDocuments: (auditId: string) => `audits:${auditId}:documents`,
  auditTemplates: makeFactory('audit-templates'),
  auditCategories: makeFactory('audit-categories'),

  // Stage B will populate the rest of these. The shape is identical for every
  // resource family in BACKEND-API-MAP §4.
  observations: makeFactory('observations'),
  risks: makeFactory('risks'),
  policies: makeFactory('policies'),
  circulars: makeFactory('circulars'),
  circularImplementations: (circularId: string) => `circulars:${circularId}:implementations`,
  circularTimeline: (circularId: string) => `circulars:${circularId}:timeline`,
  circularWorkflowSteps: (circularId: string) => `circulars:${circularId}:workflow-steps`,
  policyAttachments: (policyId: string) => `policies:${policyId}:attachments`,
  letters: makeFactory('letters'),
  letterAttachments: (letterId: string) => `letters:${letterId}:attachments`,
  letterTimeline: (letterId: string) => `letters:${letterId}:timeline`,
  letterPlaceholders: (letterId: string) => `letters:${letterId}:placeholders`,
  letterTemplates: makeFactory('letter-templates'),
  letterTypes: makeFactory('letter-types'),
  letterSubCategories: makeFactory('letter-sub-categories'),
  authorityDepartments: makeFactory('authority-departments'),
  correspondence: makeFactory('correspondence'),
  correspondenceAttachments: (correspondenceId: string) =>
    `correspondence:${correspondenceId}:attachments`,
  correspondenceTypes: makeFactory('correspondence-types'),
  advisory: makeFactory('advisory'),
  calendar: makeFactory('calendar'),
  training: makeFactory('training'),
  team: makeFactory('team'),
  reports: makeFactory('reports'),
  notifications: makeFactory('notifications'),
  messages: makeFactory('messages'),
  frameworks: makeFactory('frameworks'),
  frameworkConfig: makeFactory('framework-config'),
  departments: makeFactory('departments'),
  businessUnits: makeFactory('business-units'),
  policyCategories: makeFactory('policy-categories'),
  scaleLabels: () => 'scale-labels',
  complianceSettings: () => 'compliance-settings',
  saudization: () => 'saudization',
  onboarding: () => 'onboarding',
  evaluations: makeFactory('compliance-evaluations'),
  evaluationScores: () => 'compliance-evaluations:scores',
  globalAuditLogs: makeFactory('audit-log'),
  jobs: makeFactory('jobs'),
  compliance: () => 'compliance',
  me: () => 'me',
} as const

/**
 * Wrapper around Next 16's `revalidateTag`. Safe no-op outside a request
 * (e.g. during tests). Next 16 requires a `profile` second arg — `'max'` is
 * the canonical "purge immediately" profile (matches `updateTag` semantics
 * but works from Route Handlers, which can't call `updateTag`).
 */
export function revalidate(tag: string, profile: string | { expire?: number } = 'max'): void {
  try {
    revalidateTag(tag, profile)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[api/cache] revalidate failed for tag', tag, e)
  }
}

/** Revalidate a batch of tags. */
export function revalidateAll(tags: readonly string[]): void {
  for (const t of tags) revalidate(t)
}
