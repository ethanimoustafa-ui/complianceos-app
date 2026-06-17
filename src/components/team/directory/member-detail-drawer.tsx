'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'
import { useAuthStore } from '@/stores/auth-store'
import { useTeamStore } from '@/stores/team-store'
import { useWorkload } from '@/hooks/useWorkload'
import { EditableSelect } from '@/components/ui/editable-select'
import type { TeamMember } from '@/types'

function CapacityRing({ capacity }: { capacity: number }) {
  const circumference = 2 * Math.PI * 40
  const isOverflow = capacity > 100
  const basePercent = isOverflow ? 100 : capacity
  const overflowPercent = isOverflow ? capacity - 100 : 0
  const baseOffset = circumference - (basePercent / 100) * circumference
  const overflowOffset = circumference - (Math.min(overflowPercent, 100) / 100) * circumference
  const ringColor = capacity >= 90 ? 'text-rose-500' : capacity >= 75 ? 'text-amber-500' : 'text-emerald-500'

  return (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle className="text-slate-200 stroke-current" strokeWidth="12" fill="transparent" r="40" cx="50" cy="50" />
        <circle
          className={`${ringColor} stroke-current transition-all duration-700`}
          strokeWidth="12" strokeLinecap="round" fill="transparent" r="40" cx="50" cy="50"
          strokeDasharray={circumference} strokeDashoffset={baseOffset}
        />
        {isOverflow && (
          <circle
            className="text-purple-500 stroke-current transition-all duration-700"
            strokeWidth="6" strokeLinecap="round" fill="transparent" r="40" cx="50" cy="50"
            strokeDasharray={circumference} strokeDashoffset={overflowOffset}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-900">{capacity}%</span>
      </div>
    </div>
  )
}

interface MemberDetailDrawerProps {
  member: TeamMember | null
  isOpen: boolean
  onClose: () => void
  onUpdateRole: (memberId: string, newRole: TeamMember['role']) => void | Promise<unknown>
  onToast: (message: string) => void
}

export function MemberDetailDrawer({
  member, isOpen, onClose, onUpdateRole, onToast,
}: MemberDetailDrawerProps) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((s) => s.user)
  const isMutating = useTeamStore((s) => s.isMutating)
  const workload = useWorkload(member?.id ?? '', member ?? undefined, member?.name)
  const [roleValue, setRoleValue] = useState(member?.role ?? 'officer')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  // Local busy flag so the spinner spans the *entire* save (PATCH + store
  // refetch), independent of the shared store `isMutating`.
  const [savingRole, setSavingRole] = useState(false)

  // Per-member permissions now live in the Access Control matrix beneath the
  // directory — the drawer only edits the member's role. Reset the role draft
  // (and the unsaved flag) whenever a different member is opened, or its role
  // changes server-side (e.g. after a save). Done during render — React's
  // "adjust state when a prop changes" pattern — to avoid a cascading effect.
  const memberKey = member ? `${member.id}:${member.role}` : null
  const [syncedMemberKey, setSyncedMemberKey] = useState(memberKey)
  if (memberKey !== syncedMemberKey) {
    setSyncedMemberKey(memberKey)
    if (member) {
      setRoleValue(member.role)
      setHasUnsavedChanges(false)
    }
  }

  const roleColorMap: Record<string, string> = {
    admin: 'text-blue-600',
    manager: 'text-emerald-600',
    officer: 'text-slate-900',
    auditor: 'text-slate-500',
  }

  const handleRoleChange = (newRole: TeamMember['role']) => {
    if (!member) return
    // Manager and Admin are elevated (admin-level) — only an Admin may grant them.
    if ((newRole === 'admin' || newRole === 'manager') && currentUser?.role !== 'admin') {
      onToast(t('team.cannotElevateToAdmin' as TranslationKey))
      return
    }
    setRoleValue(newRole)
    setHasUnsavedChanges(true)
  }

  const capacityValue = Math.round(workload.percentage)

  return (
    <aside
      // No height class: stretches to the flex row, which the page bounds to the
      // viewport (`h-screen`). Inner content scrolls; the footer stays pinned.
      className={`bg-white border-s border-slate-200 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden ${
        isOpen && member ? 'w-[400px]' : 'w-0'
      }`}
    >
      {member && (
        <div className="flex-1 flex flex-col h-full min-w-[400px]">
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">
                {t('team.memberInsights')}
              </span>
              <button onClick={() => { setHasUnsavedChanges(false); onClose() }} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                <Icon icon="lucide:x" className="text-xl" />
              </button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <img
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar || member.name}`}
                className="w-16 h-16 rounded-2xl border-4 border-slate-50"
                alt={member.name}
              />
              <div>
                <h2 className="text-xl font-bold font-display text-slate-900">{member.name}</h2>
                <p className={`text-xs font-bold uppercase tracking-widest ${roleColorMap[member.role] || 'text-emerald-600'}`}>
                  {t(`team.role${member.role.charAt(0).toUpperCase() + member.role.slice(1)}` as TranslationKey)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain hide-scrollbar p-6 space-y-8">
            {/* Assignments */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                <span>{t('team.currentAssignments')}</span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[9px]">
                  {workload.totalAssignments || member.assignments?.length || 0}
                </span>
              </h3>
              <div className="space-y-3">
                {workload.items.map((item) => {
                  const badgeColors: Record<string, string> = {
                    observation: 'bg-rose-100 text-rose-700',
                    audit: 'bg-emerald-100 text-emerald-700',
                    policy: 'bg-blue-100 text-blue-700',
                    'sama-letter': 'bg-amber-100 text-amber-700',
                    circular: 'bg-violet-100 text-violet-700',
                    correspondence: 'bg-slate-200 text-slate-700',
                    advisory: 'bg-indigo-100 text-indigo-700',
                    risk: 'bg-orange-100 text-orange-700',
                  }
                  const typeLabels: Record<string, string> = {
                    observation: t('team.typeObservation' as TranslationKey),
                    audit: t('team.typeAudit' as TranslationKey),
                    policy: t('team.typePolicy' as TranslationKey),
                    correspondence: t('team.typeCorrespondence' as TranslationKey),
                    advisory: t('team.typeAdvisory' as TranslationKey),
                    'sama-letter': t('team.typeSamaLetter' as TranslationKey),
                    risk: t('team.typeRisk' as TranslationKey),
                    circular: t('team.typeCircular' as TranslationKey),
                  }
                  return (
                    <div key={`${item.type}-${item.id}`} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${badgeColors[item.type] || 'bg-slate-100 text-slate-600'}`}>
                          {typeLabels[item.type] || item.type}
                        </span>
                        <p className="text-xs font-bold text-slate-700 truncate flex-1">{item.title}</p>
                      </div>
                    </div>
                  )
                })}
                {(member.assignments || []).map((assignment, index) => (
                  <div key={`task-${index}`} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-slate-200 text-slate-600">
                          {t('team.typeTask' as TranslationKey)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{assignment.title}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-bold tracking-tighter">
                            {t('team.due')}: {assignment.dueDate}
                          </p>
                        </div>
                      </div>
                      <RoleGuard requiredRole="manager" hidden>
                        <button
                          onClick={() => {
                            const store = useTeamStore.getState()
                            store.unassignTask(member.id, assignment.title)
                            onToast(t('team.unassign' as TranslationKey))
                          }}
                          className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          title={t('team.unassign' as TranslationKey)}
                        >
                          <Icon icon="lucide:x" className="w-3 h-3" />
                        </button>
                      </RoleGuard>
                    </div>
                  </div>
                ))}
                {(member.assignments || []).length > 0 && (
                  <RoleGuard requiredRole="manager" hidden>
                    <button
                      onClick={() => {
                        if (!member) return
                        useTeamStore.getState().update(member.id, { assignments: [] })
                        onToast(t('team.clearAssignments' as TranslationKey))
                      }}
                      className="text-[10px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      {t('team.clearAssignments' as TranslationKey)}
                    </button>
                  </RoleGuard>
                )}
              </div>
            </section>

            {/* Capacity Metric */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                {t('team.bandwidthAnalysis')}
              </h3>
              <div className="flex items-center gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <CapacityRing capacity={capacityValue} />
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {capacityValue >= 90 ? t('team.nearCapacity') : capacityValue >= 70 ? t('team.moderateLoad') : t('team.available')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {workload.totalAssignments || member.assignments?.length || 0} {t('team.tasksPending')}
                  </p>
                </div>
              </div>
            </section>

            {/* Role Editing */}
            <RoleGuard requiredRole="manager" hidden>
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  {t('team.memberRole' as TranslationKey)}
                </h3>
                <EditableSelect
                  locked
                  value={roleValue}
                  onChange={(id) => handleRoleChange(id as TeamMember['role'])}
                  items={[
                    { id: 'auditor', label: t('team.roleAuditor' as TranslationKey) },
                    { id: 'officer', label: t('team.roleOfficer' as TranslationKey) },
                    ...(currentUser?.role === 'admin'
                      ? [
                          { id: 'manager', label: t('team.roleManager' as TranslationKey) },
                          { id: 'admin', label: t('team.roleAdmin' as TranslationKey) },
                        ]
                      : []),
                  ]}
                />
              </section>
            </RoleGuard>

            {/* Access control lives in the matrix beneath the directory now —
                the drawer is role + assignments only. */}
          </div>

          <div className="p-6 border-t border-slate-100 space-y-3">
            {hasUnsavedChanges && (
              <p className="text-xs font-bold text-amber-600 mb-2 flex items-center gap-1">
                <Icon icon="lucide:alert-circle" className="w-3 h-3" />
                {t('team.unsavedChanges' as TranslationKey)}
              </p>
            )}
            <LoadingButton
              loading={savingRole}
              variant="dark"
              className="w-full"
              disabled={!hasUnsavedChanges || savingRole}
              onClick={async () => {
                if (!member || roleValue === member.role) return
                setSavingRole(true)
                try {
                  await onUpdateRole(member.id, roleValue)
                  setHasUnsavedChanges(false)
                  onToast(t('team.roleUpdated' as TranslationKey))
                } catch {
                  onToast(t('team.roleUpdateFailed' as TranslationKey))
                } finally {
                  setSavingRole(false)
                }
              }}
            >
              {t('team.saveChanges' as TranslationKey)}
              <Icon icon="lucide:check" />
            </LoadingButton>
            <RoleGuard requiredRole="admin" hidden>
              <Button
                variant="outline"
                className="w-full text-rose-600 border-rose-200 hover:bg-rose-50"
                onClick={() => { setDeleteConfirmName(''); setIsDeleteModalOpen(true) }}
              >
                <Icon icon="lucide:trash-2" className="w-4 h-4" />
                {t('team.deleteMember' as TranslationKey)}
              </Button>
            </RoleGuard>
          </div>

          {/* Delete Confirmation Modal */}
          <Modal
            isOpen={isDeleteModalOpen}
            onClose={() => setIsDeleteModalOpen(false)}
            title={t('team.deleteMember' as TranslationKey)}
            size="sm"
          >
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                <div className="flex items-start gap-2">
                  <Icon icon="lucide:alert-triangle" className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-rose-700 font-medium">
                    This will permanently remove <strong>{member.name}</strong> from the team. They will lose access immediately.
                  </p>
                </div>
                <p className="text-xs text-slate-600">
                  {t('team.deleteConfirmation' as TranslationKey)} <strong>{member.name}</strong>
                </p>
              </div>
              <input
                type="text"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                placeholder={t('team.typeNameToConfirm' as TranslationKey)}
                className="w-full h-11 px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setIsDeleteModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <LoadingButton
                  loading={isMutating}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
                  disabled={deleteConfirmName !== member.name}
                  onClick={async () => {
                    await useTeamStore.getState().remove(member.id)
                    setIsDeleteModalOpen(false)
                    onClose()
                    onToast(t('team.memberDeleted' as TranslationKey))
                  }}
                >
                  {t('team.deleteMember' as TranslationKey)}
                </LoadingButton>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </aside>
  )
}
