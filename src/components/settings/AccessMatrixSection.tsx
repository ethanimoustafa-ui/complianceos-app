'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Icon } from '@iconify/react'
import { LoadingButton } from '@/components/ui/loading-button'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
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
  GRANULAR_ACTIONS,
  type GranularAction,
  type Permission,
} from '@/lib/permissions-registry'
import type { TeamMember } from '@/types'

// Plan §2.1 default permission bundles per role (label tier).
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
    'Can Advance Workflow',
  ],
  manager: [...PERMISSIONS],
  admin: [...PERMISSIONS],
}

// Label → display-name i18n key.
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
  'Can Advance Workflow': 'accessMatrix.permAdvanceWorkflow' as TranslationKey,
}

// Label → plain-language description i18n key (the custom tooltip copy).
const PERMISSION_DESC: Record<Permission, TranslationKey> = {
  'Approve Policy Reviews': 'accessMatrix.descApproveReviews' as TranslationKey,
  'Approve SAMA Letters': 'accessMatrix.descApproveLetters' as TranslationKey,
  'Manage Audit Findings': 'accessMatrix.descManageFindings' as TranslationKey,
  'View Risk Register': 'accessMatrix.descViewRiskRegister' as TranslationKey,
  'Export Compliance Data': 'accessMatrix.descExportData' as TranslationKey,
  'Can Act As Approver': 'accessMatrix.descActAsApprover' as TranslationKey,
  'Manage Training Programs': 'accessMatrix.descManageTraining' as TranslationKey,
  'Manage Settings': 'accessMatrix.descManageSettings' as TranslationKey,
  'Manage Team & Permissions': 'accessMatrix.descManageTeam' as TranslationKey,
  'Configure Frameworks': 'accessMatrix.descConfigureFrameworks' as TranslationKey,
  'Configure Lists & Categories': 'accessMatrix.descConfigureLists' as TranslationKey,
  'Manage Letter Templates': 'accessMatrix.descManageLetterTemplates' as TranslationKey,
  'Manage Policy Templates': 'accessMatrix.descManagePolicyTemplates' as TranslationKey,
  'Manage Audit Templates': 'accessMatrix.descManageAuditTemplates' as TranslationKey,
  'Switch User (Demo)': 'accessMatrix.descSwitchUser' as TranslationKey,
  'Can Advance Workflow': 'accessMatrix.descAdvanceWorkflow' as TranslationKey,
}

// Label tier grouped by the PAGE/area each governs (so "Rules" shows, and
// "Letters" reads meaningfully). Every label appears exactly once.
const PERMISSION_GROUPS: { labelKey: TranslationKey; perms: Permission[] }[] = [
  { labelKey: 'accessMatrix.groupPolicies', perms: ['Approve Policy Reviews', 'Manage Policy Templates'] },
  { labelKey: 'accessMatrix.groupLetters', perms: ['Approve SAMA Letters', 'Manage Letter Templates'] },
  { labelKey: 'accessMatrix.groupAudits', perms: ['Manage Audit Findings', 'Manage Audit Templates'] },
  { labelKey: 'accessMatrix.groupReports', perms: ['View Risk Register', 'Export Compliance Data'] },
  { labelKey: 'accessMatrix.groupTraining', perms: ['Manage Training Programs'] },
  { labelKey: 'accessMatrix.groupApprovals', perms: ['Can Act As Approver', 'Can Advance Workflow'] },
  // Settings group: ONLY the two independently-grantable settings capabilities an
  // officer can be given. "Manage Settings" was removed (the settings page is open
  // to every signed-in user; sections self-gate on the two keys below). "Manage
  // Team & Permissions" was removed (the Team Directory is role-gated to
  // managers/admins, so granting it to an officer is a no-op). "Switch User (Demo)"
  // was removed (impersonation no longer exists). Managers/admins still hold all of
  // these by role — this only changes what the matrix can grant to officers.
  { labelKey: 'accessMatrix.groupAdmin', perms: ['Configure Frameworks', 'Configure Lists & Categories'] },
]

const ACTION_KEYS: Record<GranularAction, TranslationKey> = {
  create: 'accessMatrix.actionCreate' as TranslationKey,
  edit: 'accessMatrix.actionEdit' as TranslationKey,
  delete: 'accessMatrix.actionDelete' as TranslationKey,
  export: 'accessMatrix.actionExport' as TranslationKey,
  checklist: 'accessMatrix.actionChecklist' as TranslationKey,
}
const ACTION_DESC_KEYS: Record<GranularAction, TranslationKey> = {
  create: 'accessMatrix.descCreate' as TranslationKey,
  edit: 'accessMatrix.descEdit' as TranslationKey,
  delete: 'accessMatrix.descDelete' as TranslationKey,
  export: 'accessMatrix.descExport' as TranslationKey,
  checklist: 'accessMatrix.descChecklist' as TranslationKey,
}

const ROLE_BADGE_STYLE: Record<TeamMember['role'], string> = {
  admin: 'bg-blue-100 text-blue-700',
  manager: 'bg-emerald-100 text-emerald-700',
  officer: 'bg-slate-100 text-slate-700',
  auditor: 'bg-slate-50 text-slate-500',
}

// Every toggle id the matrix manages: the high-level labels followed by the
// granular per-entity backend keys.
const ALL_TOGGLE_IDS: string[] = [...PERMISSIONS, ...GRANULAR_PERMISSION_KEYS]

function buildAccessControls(enabledIds: Set<string>): { label: string; enabled: boolean }[] {
  return ALL_TOGGLE_IDS.map((id) => ({ label: id, enabled: enabledIds.has(id) }))
}

function getEnabledIds(member: TeamMember): Set<string> {
  const valid = new Set<string>(ALL_TOGGLE_IDS)
  return new Set(
    (member.accessControls ?? [])
      .filter((ac) => ac.enabled && valid.has(ac.label))
      .map((ac) => ac.label),
  )
}

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
  const setPermission = useTeamStore((s) => s.setPermission)
  const currentUser = useAuthStore((s) => s.user)
  const log = useUserLogStore((s) => s.log)

  // One member expanded at a time (the inline horizontal drawer).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // `${memberId}:${toggleId}` for toggles whose save is in flight (per-toggle spinner).
  const [pending, setPending] = useState<Set<string>>(new Set())

  const sortedMembers = useMemo(() => {
    const roleOrder: Record<TeamMember['role'], number> = { admin: 0, manager: 1, officer: 2, auditor: 3 }
    return [...members].sort((a, b) => {
      const rd = roleOrder[a.role] - roleOrder[b.role]
      if (rd !== 0) return rd
      return a.name.localeCompare(b.name)
    })
  }, [members])

  // Admin + Manager are all-on (admin-level) and not editable from the matrix.
  const isFixedAllOn = (m: TeamMember) => m.role === 'admin' || m.role === 'manager'

  async function handleToggle(member: TeamMember, id: string) {
    if (isFixedAllOn(member)) return
    const pk = `${member.id}:${id}`
    // Read the LATEST store state (not the captured prop) so a toggle fired while
    // another is mid-flight builds on the up-to-date grant set.
    const latest = useTeamStore.getState().byId[member.id] ?? member
    const wasEnabled = getEnabledIds(latest).has(id)

    setPending((p) => new Set(p).add(pk))
    try {
      // Delta write — only THIS toggle's key persists, so concurrent toggles
      // load independently and never clobber one another.
      await setPermission(member.id, id, !wasEnabled)
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
    } catch {
      // setPermission already reverted the optimistic flip; the api-client
      // surfaces its own error toast. Swallow so the finally still clears pending.
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(pk)
        return n
      })
    }
  }

  function applyRoleDefaults() {
    for (const m of members) {
      if (m.role === 'admin') continue
      const before = getEnabledLabels(m)
      const after = ROLE_DEFAULTS[m.role]
      const granted = after.filter((p) => !before.includes(p))
      const revoked = before.filter((p) => !after.includes(p))
      // Seed the label tier; preserve any granular per-entity toggles set manually.
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
    }
  }

  function clearAllNonAdmin() {
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
    }
  }

  // A single labelled toggle chip (a label OR a granular key) with a custom
  // tooltip and an in-flight spinner.
  function PermChip({
    member, id, label, description,
  }: { member: TeamMember; id: string; label: string; description: string }) {
    const allOn = isFixedAllOn(member)
    const isOn = allOn || getEnabledIds(member).has(id)
    const saving = pending.has(`${member.id}:${id}`)
    return (
      <Tooltip content={description} bubbleClassName="max-w-[15rem]">
        <button
          type="button"
          disabled={allOn || saving}
          aria-pressed={isOn}
          aria-label={`${member.name} — ${label}`}
          onClick={() => handleToggle(member, id)}
          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            isOn
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-white text-slate-600'
          } ${allOn ? 'opacity-70 cursor-not-allowed' : 'hover:border-slate-300 cursor-pointer'}`}
        >
          <span
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
              isOn ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            {saving ? (
              <Icon
                icon="lucide:loader-2"
                className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white"
              />
            ) : (
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
                  isOn ? 'start-3.5' : 'start-0.5'
                }`}
              />
            )}
          </span>
          <span className="whitespace-nowrap">{label}</span>
        </button>
      </Tooltip>
    )
  }

  function GroupRow({ name, children }: { name: string; children: ReactNode }) {
    return (
      <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-44 shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {name}
        </div>
        <div className="flex flex-wrap gap-1.5">{children}</div>
      </div>
    )
  }

  return (
    // Self-hides when the viewer can't manage permissions.
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
          <div className="p-6"><ListSkeleton rows={5} columns={3} /></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedMembers.map((m) => {
              const allOn = isFixedAllOn(m)
              const enabledCount = getEnabledIds(m).size
              const isExpanded = expandedId === m.id
              return (
                <li key={m.id}>
                  {/* Collapsed header — click to expand the inline drawer. */}
                  <button
                    type="button"
                    onClick={() => setExpandedId((cur) => (cur === m.id ? null : m.id))}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center gap-3 px-6 py-3.5 text-start hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <Icon
                      icon="lucide:chevron-right"
                      className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${m.avatar || m.name}`}
                      className="w-9 h-9 rounded-lg border border-slate-200"
                      alt={m.name}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-slate-900 truncate">{m.name}</div>
                      <span className={`inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${ROLE_BADGE_STYLE[m.role]}`}>
                        {t(`team.role${m.role.charAt(0).toUpperCase() + m.role.slice(1)}` as TranslationKey)}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-slate-400">
                      {allOn
                        ? t('accessMatrix.fullAccess')
                        : t('accessMatrix.enabledCount', { count: enabledCount, total: ALL_TOGGLE_IDS.length })}
                    </span>
                  </button>

                  {/* Inline drawer — animates open (height + a slight horizontal
                      slide of the content for the "expands to the right" feel). */}
                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-out"
                    style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                      <div
                        className={`px-6 pb-5 pt-1 transition-all duration-300 ease-out ${
                          isExpanded ? 'translate-x-0 opacity-100' : '-translate-x-3 opacity-0'
                        }`}
                      >
                        {allOn && (
                          <p className="mb-3 flex items-center gap-1.5 text-xs text-slate-400">
                            <Icon icon="lucide:info" className="text-sm" />
                            {t('accessMatrix.adminAlwaysOn')}
                          </p>
                        )}

                        {/* By page (label tier) */}
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-300 mb-1">
                          {t('accessMatrix.byPage')}
                        </p>
                        <div className="divide-y divide-slate-50">
                          {PERMISSION_GROUPS.map((g) => (
                            <GroupRow key={g.labelKey} name={t(g.labelKey)}>
                              {g.perms.map((p) => (
                                <PermChip
                                  key={p}
                                  member={m}
                                  id={p}
                                  label={t(PERMISSION_KEYS[p])}
                                  description={t(PERMISSION_DESC[p])}
                                />
                              ))}
                            </GroupRow>
                          ))}
                        </div>

                        {/* By entity (granular create/edit/delete/export/checklist) */}
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-300 mt-4 mb-1">
                          {t('accessMatrix.byEntity')}
                        </p>
                        <div className="divide-y divide-slate-50">
                          {GRANULAR_ENTITIES.map((e) => (
                            <GroupRow key={e.groupKey} name={t(e.groupKey as TranslationKey)}>
                              {GRANULAR_ACTIONS.map((a) => {
                                const key = e[a]
                                if (!key) return null
                                return (
                                  <PermChip
                                    key={key}
                                    member={m}
                                    id={key}
                                    label={t(ACTION_KEYS[a])}
                                    description={t(ACTION_DESC_KEYS[a], { entity: t(e.groupKey as TranslationKey) })}
                                  />
                                )
                              })}
                            </GroupRow>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="p-4 border-t border-slate-100 bg-slate-50/40 text-[11px] text-slate-500">
          <Icon icon="lucide:info" className="inline w-3.5 h-3.5 me-1 align-text-bottom" />
          {t('accessMatrix.adminFootnote')}
        </div>
      </section>
    </Gate>
  )
}
