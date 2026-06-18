'use client'

import { useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { useTeamStore } from '@/stores/team-store'
import { useAuthStore } from '@/stores/auth-store'
import { useUserLogStore } from '@/stores/user-log-store'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { Gate } from '@/components/auth/gate'
import {
  PERMISSIONS,
  GRANULAR_ENTITIES,
  GRANULAR_PERMISSION_KEYS,
  type Permission,
} from '@/lib/permissions-registry'
import type { TeamMember } from '@/types'

// Plan §2.1 default permission bundles per role.
const ROLE_DEFAULTS: Record<TeamMember['role'], Permission[]> = {
  auditor: ['View Risk Register'],
  officer: [
    'Approve Policy Reviews',
    'Approve SAMA Letters',
    'Manage Audit Findings',
    'View Risk Register',
    'Export Compliance Data',
    'Can Act As Approver',
    'Manage Training Programs',
  ],
  manager: [...PERMISSIONS],
  admin: [...PERMISSIONS],
}

const PERMISSION_KEYS: Record<Permission, TranslationKey> = {
  'Approve Policy Reviews': 'team.permissionApproveReviews' as TranslationKey,
  'Approve SAMA Letters': 'team.permissionApproveSAMA' as TranslationKey,
  'Manage Audit Findings': 'team.permissionManageFindings' as TranslationKey,
  'View Risk Register': 'team.permissionViewRiskRegister' as TranslationKey,
  'Export Compliance Data': 'team.permissionExportData' as TranslationKey,
  'Can Act As Approver': 'team.canActAsApprover' as TranslationKey,
  'Manage Training Programs': 'training.manageTrainingPrograms' as TranslationKey,
  'Manage Settings': 'team.permissionManageSettings' as TranslationKey,
  'Manage Team & Permissions': 'team.permissionManageTeamPermissions' as TranslationKey,
  'Configure Frameworks': 'team.permissionConfigureFrameworks' as TranslationKey,
  'Configure Lists & Categories': 'team.permissionConfigureLists' as TranslationKey,
  'Manage Letter Templates': 'team.permissionManageLetterTemplates' as TranslationKey,
  'Manage Policy Templates': 'team.permissionManagePolicyTemplates' as TranslationKey,
  'Manage Audit Templates': 'team.permissionManageAuditTemplates' as TranslationKey,
  'Switch User (Demo)': 'team.permissionSwitchUserDemo' as TranslationKey,
}

// Display-only grouping of the 15 matrix permissions into labelled column
// groups so the header shows which page/area each toggle governs. PURELY
// presentational: toggle identity/state key off the permission LABEL, not its
// column position, so reordering columns here is safe and does NOT touch
// buildAccessControls / getEnabledLabels (both stay sourced from PERMISSIONS).
const PERMISSION_GROUPS: { labelKey: TranslationKey; perms: Permission[] }[] = [
  { labelKey: 'accessMatrix.groupPolicies' as TranslationKey, perms: ['Approve Policy Reviews', 'Manage Policy Templates'] },
  { labelKey: 'accessMatrix.groupLetters' as TranslationKey, perms: ['Approve SAMA Letters', 'Manage Letter Templates'] },
  { labelKey: 'accessMatrix.groupAudits' as TranslationKey, perms: ['Manage Audit Findings', 'Manage Audit Templates'] },
  { labelKey: 'accessMatrix.groupReports' as TranslationKey, perms: ['View Risk Register', 'Export Compliance Data'] },
  { labelKey: 'accessMatrix.groupTraining' as TranslationKey, perms: ['Manage Training Programs'] },
  { labelKey: 'accessMatrix.groupApprovals' as TranslationKey, perms: ['Can Act As Approver'] },
  { labelKey: 'accessMatrix.groupAdmin' as TranslationKey, perms: ['Manage Settings', 'Manage Team & Permissions', 'Configure Frameworks', 'Configure Lists & Categories', 'Switch User (Demo)'] },
]
// Flattened column order (covers all 15 PERMISSIONS) the body iterates so its
// cells line up beneath the grouped header.
const ORDERED_PERMS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.perms)

// Granular per-entity action columns: each entity contributes create/edit/delete
// backend-key toggles, grouped under the entity header. The body iterates this
// flat list so cells line up beneath the grouped header.
const GRANULAR_COLUMNS: { key: string; actionKey: TranslationKey; isGroupStart: boolean }[] =
  GRANULAR_ENTITIES.flatMap((e, ei) => [
    { key: e.create, actionKey: 'accessMatrix.actionCreate' as TranslationKey, isGroupStart: ei > 0 },
    { key: e.edit, actionKey: 'accessMatrix.actionEdit' as TranslationKey, isGroupStart: false },
    { key: e.delete, actionKey: 'accessMatrix.actionDelete' as TranslationKey, isGroupStart: false },
  ])
// First permission of each group after the first — used to draw a subtle
// vertical separator between column groups in both the header and the body.
const GROUP_START_PERMS = new Set<Permission>(PERMISSION_GROUPS.slice(1).map((g) => g.perms[0]))

const ROLE_BADGE_STYLE: Record<TeamMember['role'], string> = {
  admin: 'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  officer: 'bg-slate-100 text-slate-700',
  auditor: 'bg-slate-50 text-slate-500',
}

// Every toggle id the matrix manages, in render order: the 15 high-level
// labels followed by the granular per-entity backend keys.
const ALL_TOGGLE_IDS: string[] = [...PERMISSIONS, ...GRANULAR_PERMISSION_KEYS]

// Build a complete accessControls array from the set of currently-enabled
// toggle ids (labels + granular keys). Every managed id is emitted so the
// payload is a full snapshot.
function buildAccessControls(enabledIds: Set<string>): { label: string; enabled: boolean }[] {
  return ALL_TOGGLE_IDS.map((id) => ({ label: id, enabled: enabledIds.has(id) }))
}

// Currently-enabled toggle ids for a member (labels + granular keys).
function getEnabledIds(member: TeamMember): Set<string> {
  const valid = new Set<string>(ALL_TOGGLE_IDS)
  return new Set(
    (member.accessControls ?? [])
      .filter((ac) => ac.enabled && valid.has(ac.label))
      .map((ac) => ac.label),
  )
}

// Back-compat helper for role-defaults / clear-all logging (label tier only).
function getEnabledLabels(member: TeamMember): Permission[] {
  const ids = getEnabledIds(member)
  return PERMISSIONS.filter((p) => ids.has(p))
}

export function AccessMatrixSection() {
  const { t } = useTranslation()
  const members = useTeamStore((s) => s.members)
  const isLoading = useTeamStore((s) => s.isLoading)
  const isMutating = useTeamStore((s) => s.isMutating)
  const updateMember = useTeamStore((s) => s.update)
  const currentUser = useAuthStore((s) => s.user)
  const log = useUserLogStore((s) => s.log)

  const sortedMembers = useMemo(() => {
    const roleOrder: Record<TeamMember['role'], number> = { admin: 0, manager: 1, officer: 2, auditor: 3 }
    return [...members].sort((a, b) => {
      const rd = roleOrder[a.role] - roleOrder[b.role]
      if (rd !== 0) return rd
      return a.name.localeCompare(b.name)
    })
  }, [members])

  // Toggle a single id (a label OR a granular backend key) for a member.
  function handleToggle(member: TeamMember, id: string) {
    if (member.role === 'admin' || member.role === 'manager') return // Admin/Manager: all-on (admin-level).
    const before = getEnabledIds(member)
    const wasEnabled = before.has(id)
    const after = new Set(before)
    if (wasEnabled) after.delete(id)
    else after.add(id)
    void updateMember(member.id, { accessControls: buildAccessControls(after) })
    log({
      userId: currentUser?.id ?? 'anonymous',
      action: 'team.permissions_changed',
      target: `member:${member.id}`,
      metadata: {
        targetMemberName: member.name,
        granted: wasEnabled ? [] : [id],
        revoked: wasEnabled ? [id] : [],
      },
    })
  }

  function applyRoleDefaults() {
    let touched = 0
    for (const m of members) {
      if (m.role === 'admin') continue
      const before = getEnabledLabels(m)
      const after = ROLE_DEFAULTS[m.role]
      const granted = after.filter((p) => !before.includes(p))
      const revoked = before.filter((p) => !after.includes(p))
      // Role defaults only seed the high-level label tier; preserve any granular
      // per-entity toggles the operator set manually.
      const existingGranular = GRANULAR_PERMISSION_KEYS.filter((k) => getEnabledIds(m).has(k))
      const afterIds = new Set<string>([...after, ...existingGranular])
      if (granted.length === 0 && revoked.length === 0) continue
      void updateMember(m.id, { accessControls: buildAccessControls(afterIds) })
      log({
        userId: currentUser?.id ?? 'anonymous',
        action: 'team.permissions_changed',
        target: `member:${m.id}`,
        metadata: { targetMemberName: m.name, granted, revoked, source: 'role-defaults' },
      })
      touched += 1
    }
    return touched
  }

  function clearAllNonAdmin() {
    let touched = 0
    for (const m of members) {
      if (m.role === 'admin') continue
      const before = getEnabledIds(m)
      if (before.size === 0) continue
      void updateMember(m.id, { accessControls: buildAccessControls(new Set()) })
      log({
        userId: currentUser?.id ?? 'anonymous',
        action: 'team.permissions_changed',
        target: `member:${m.id}`,
        metadata: { targetMemberName: m.name, granted: [], revoked: [...before], source: 'clear-all' },
      })
      touched += 1
    }
    return touched
  }

  return (
    // Self-hides when the viewer can't manage permissions — it now lives on the
    // (manager-visible) Team Directory, where an inline forbidden panel would be
    // noise. Officers never reach the page; managers without the perm just don't
    // see the matrix.
    <Gate perm="Manage Team & Permissions">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-start justify-between gap-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 font-display">{t('accessMatrix.title')}</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">{t('accessMatrix.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LoadingButton variant="outline" loading={isMutating} onClick={() => applyRoleDefaults()}>
              <Icon icon="lucide:wand-2" />
              {t('accessMatrix.applyRoleDefaults')}
            </LoadingButton>
            <LoadingButton variant="outline" loading={isMutating} onClick={() => clearAllNonAdmin()}>
              <Icon icon="lucide:eraser" />
              {t('accessMatrix.clearAll')}
            </LoadingButton>
          </div>
        </div>

        {isLoading && members.length === 0 ? (
          <div className="p-6"><ListSkeleton rows={5} columns={5} /></div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              {/* Row 1 — category headers spanning their permission columns. */}
              <tr className="bg-slate-50">
                <th
                  rowSpan={2}
                  className="sticky start-0 top-0 z-30 bg-slate-50 border-b border-slate-200 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 min-w-[200px] align-bottom"
                >
                  {t('accessMatrix.member')}
                </th>
                {PERMISSION_GROUPS.map((g, gi) => (
                  <th
                    key={g.labelKey}
                    colSpan={g.perms.length}
                    className={`sticky top-0 z-20 bg-slate-100/80 border-b border-slate-200 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 text-center ${gi > 0 ? 'border-s border-slate-300' : ''}`}
                  >
                    {t(g.labelKey)}
                  </th>
                ))}
              </tr>
              {/* Row 2 — individual permission headers. */}
              <tr className="bg-slate-50">
                {ORDERED_PERMS.map((p) => (
                  <th
                    key={p}
                    className={`sticky top-9 z-20 bg-slate-50 border-b border-slate-200 px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 align-bottom min-w-[110px] ${GROUP_START_PERMS.has(p) ? 'border-s border-slate-200' : ''}`}
                    title={t(PERMISSION_KEYS[p])}
                  >
                    <div className="leading-tight">{t(PERMISSION_KEYS[p])}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const enabled = getEnabledIds(m)
                const isAdminRow = m.role === 'admin'
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="sticky start-0 z-10 bg-white border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.avatar || m.name}`}
                          className="w-8 h-8 rounded-lg border border-slate-200"
                          alt={m.name}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{m.name}</div>
                          <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${ROLE_BADGE_STYLE[m.role]}`}>
                            {t(`team.role${m.role.charAt(0).toUpperCase() + m.role.slice(1)}` as TranslationKey)}
                          </span>
                        </div>
                      </div>
                    </td>
                    {ORDERED_PERMS.map((p) => {
                      const isOn = isAdminRow || enabled.has(p)
                      return (
                        <td key={p} className={`border-b border-slate-100 px-2 py-3 text-center ${GROUP_START_PERMS.has(p) ? 'border-s border-slate-200' : ''}`}>
                          <button
                            type="button"
                            disabled={isAdminRow}
                            onClick={() => handleToggle(m, p)}
                            title={isAdminRow ? t('accessMatrix.adminAlwaysOn') : t(PERMISSION_KEYS[p])}
                            className={`w-9 h-5 rounded-full relative transition-colors ${
                              isOn ? 'bg-emerald-500' : 'bg-slate-200'
                            } ${isAdminRow ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'}`}
                            aria-label={`${m.name} — ${t(PERMISSION_KEYS[p])}`}
                            aria-pressed={isOn}
                          >
                            <span
                              className={`absolute top-1 w-2.5 h-2.5 bg-white rounded-full transition-all ${
                                isOn ? 'right-1' : 'left-1'
                              }`}
                            />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* ── Granular per-entity permissions ───────────────────────────────
            Fine-grained create / edit / delete toggles per entity, grouped by
            entity. These persist directly as backend permission keys and are
            enforced by the entity create/edit/delete API routes. */}
        {!(isLoading && members.length === 0) && (
        <>
        <div className="px-8 pt-6 pb-2 border-t border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{t('accessMatrix.granularTitle')}</h3>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">{t('accessMatrix.granularSubtitle')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead>
              <tr className="bg-slate-50">
                <th
                  rowSpan={2}
                  className="sticky start-0 top-0 z-30 bg-slate-50 border-b border-slate-200 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 min-w-[200px] align-bottom"
                >
                  {t('accessMatrix.member')}
                </th>
                {GRANULAR_ENTITIES.map((e, ei) => (
                  <th
                    key={e.groupKey}
                    colSpan={3}
                    className={`sticky top-0 z-20 bg-slate-100/80 border-b border-slate-200 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 text-center ${ei > 0 ? 'border-s border-slate-300' : ''}`}
                  >
                    {t(e.groupKey as TranslationKey)}
                  </th>
                ))}
              </tr>
              <tr className="bg-slate-50">
                {GRANULAR_COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`sticky top-9 z-20 bg-slate-50 border-b border-slate-200 px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 align-bottom min-w-[72px] ${c.isGroupStart ? 'border-s border-slate-200' : ''}`}
                    title={c.key}
                  >
                    <div className="leading-tight">{t(c.actionKey)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.map((m) => {
                const enabled = getEnabledIds(m)
                const isAdminRow = m.role === 'admin'
                return (
                  <tr key={m.id} className="hover:bg-slate-50/50">
                    <td className="sticky start-0 z-10 bg-white border-b border-slate-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.avatar || m.name}`}
                          className="w-8 h-8 rounded-lg border border-slate-200"
                          alt={m.name}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">{m.name}</div>
                          <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${ROLE_BADGE_STYLE[m.role]}`}>
                            {t(`team.role${m.role.charAt(0).toUpperCase() + m.role.slice(1)}` as TranslationKey)}
                          </span>
                        </div>
                      </div>
                    </td>
                    {GRANULAR_COLUMNS.map((c) => {
                      const isOn = isAdminRow || enabled.has(c.key)
                      return (
                        <td key={c.key} className={`border-b border-slate-100 px-2 py-3 text-center ${c.isGroupStart ? 'border-s border-slate-200' : ''}`}>
                          <button
                            type="button"
                            disabled={isAdminRow}
                            onClick={() => handleToggle(m, c.key)}
                            title={isAdminRow ? t('accessMatrix.adminAlwaysOn') : c.key}
                            className={`w-9 h-5 rounded-full relative transition-colors ${
                              isOn ? 'bg-emerald-500' : 'bg-slate-200'
                            } ${isAdminRow ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'}`}
                            aria-label={`${m.name} — ${c.key}`}
                            aria-pressed={isOn}
                          >
                            <span
                              className={`absolute top-1 w-2.5 h-2.5 bg-white rounded-full transition-all ${
                                isOn ? 'right-1' : 'left-1'
                              }`}
                            />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500">
          <Icon icon="lucide:info" className="inline w-3.5 h-3.5 me-1 align-text-bottom" />
          {t('accessMatrix.adminFootnote')}
        </div>
      </section>
    </Gate>
  )
}
