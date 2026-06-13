'use client'

// Wave-19.7 — Settings manager for the `policy.approval_tier` enum list.
//
// W-CONFIG: editing a tier no longer stops at sort-order. Clicking edit opens
// the SAME rich workflow builder the policy create flow uses (AddTierModal):
// key (locked on edit), EN/AR names, and the tier's approval steps + actions.
// A tier label lives in `enum_value_definitions`; its workflow steps live in a
// paired `policy_templates.default_workflow_steps` row — exactly mirroring
// RegisterPolicyModal's handleSaveTier/openEditTier/handleDeleteTier so the two
// surfaces stay in sync. Sort order remains a quick inline edit (with a help
// hint); the seeded/custom column was dropped (it doesn't matter to the user).

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation, type TranslationKey } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ListSkeleton } from '@/components/ui/skeleton'
import { HelpTip } from '@/components/ui/tooltip'
import { useEnumValuesStore, type EnumValue } from '@/stores/enum-values-store'
import { usePolicyStore } from '@/stores/policy-store'
import { usePolicyTemplateStore } from '@/stores/policy-template-store'
import { api } from '@/lib/api-client'
import type { PolicyApprovalTier, PolicyCategory } from '@/types'
import {
  AddTierModal,
  ACTION_TYPES,
  type AddTierStep,
  type EditTier,
} from '@/components/correspondence/regulatory-updates/policies/AddTierModal'

const DOMAIN = 'policy.approval_tier'

// W19.7-BUG-1 fix: module-level stable empty reference (a fresh `[]` from a
// Zustand selector breaks useSyncExternalStore's snapshot diff).
const EMPTY_ENUM_VALUES: EnumValue[] = []

// Legacy/seeded action types → the canonical 5 the builder offers, so the
// EditableSelect always shows a real option and the value can't be lost.
const NORMALIZE: Record<string, string> = {
  publish: 'review_complete',
  approve: 'request-approval',
  vote_approve: 'request-approval',
  'send-for-review': 'request-approval',
}
function safeAction(a: string | null | undefined): string {
  if (!a) return 'move-to-next'
  if (NORMALIZE[a]) return NORMALIZE[a]
  return (ACTION_TYPES as readonly string[]).includes(a) ? a : 'move-to-next'
}

export function ApprovalTiersSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, isRTL } = useTranslation()
  const rows = useEnumValuesStore((s) => s.byDomain[DOMAIN] ?? EMPTY_ENUM_VALUES)
  const isLoading = useEnumValuesStore((s) => s.loading[DOMAIN] ?? false)
  const fetchValues = useEnumValuesStore((s) => s.fetch)
  const addEnumTier = useEnumValuesStore((s) => s.add)
  const updateValue = useEnumValuesStore((s) => s.update)
  const removeValue = useEnumValuesStore((s) => s.remove)
  const policies = usePolicyStore((s) => s.policies)
  const policyTemplates = usePolicyTemplateStore((s) => s.templates)
  const createPolicyTemplate = usePolicyTemplateStore((s) => s.create)
  const updatePolicyTemplate = usePolicyTemplateStore((s) => s.update)
  const deletePolicyTemplate = usePolicyTemplateStore((s) => s.delete)
  const fetchTemplates = usePolicyTemplateStore((s) => s.fetchAll)

  // Open → load the tier list + the templates that hold their workflow steps.
  useEffect(() => {
    void fetchValues(DOMAIN)
    void fetchTemplates()
  }, [fetchValues, fetchTemplates])

  // Rich add/edit modal (the policy workflow builder).
  const [showTierModal, setShowTierModal] = useState(false)
  const [editTier, setEditTier] = useState<EditTier | null>(null)

  // Pending delete state.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; key: string; nameEn: string } | null>(null)
  const [isDeletingTier, setIsDeletingTier] = useState(false)

  // Count usage so the Delete dialog can warn before the server 409.
  const usageCount = useMemo(
    () => (key: string) => policies.filter((p) => p.approvalTier === key).length,
    [policies],
  )

  const sorted = useMemo(
    () => rows.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [rows],
  )
  const existingKeys = useMemo(() => rows.map((r) => r.key), [rows])

  function openAdd() {
    setEditTier(null)
    setShowTierModal(true)
  }

  // Pre-fill the rich modal: steps come from the paired template, else the
  // per-tier seed (policy_workflow_step_templates), else empty. Mirrors
  // RegisterPolicyModal.openEditTier.
  async function openEdit(row: EnumValue) {
    let steps: AddTierStep[] = []
    const tmpl = policyTemplates.find(
      (tp) => tp.approvalTier === row.key && (tp.defaultWorkflowSteps?.length ?? 0) > 0,
    )
    if (tmpl) {
      steps = (tmpl.defaultWorkflowSteps as Array<{ step?: string; description?: string; actionType?: string }>).map((s) => ({
        step: s.step ?? '',
        description: s.description ?? '',
        actionType: safeAction(s.actionType),
      }))
    } else {
      try {
        const seedRows = await api.get<Array<{ step: string; description: string | null; action_type: string | null }>>(
          '/policy-workflow-step-templates',
          { tier: row.key },
        )
        steps = seedRows.map((r) => ({ step: r.step, description: r.description ?? '', actionType: safeAction(r.action_type) }))
      } catch {
        steps = []
      }
    }
    setEditTier({ key: row.key, nameEn: row.nameEn, nameAr: row.nameAr, steps })
    setShowTierModal(true)
  }

  // Replicates RegisterPolicyModal.handleSaveTier: tier label → enum row,
  // tier workflow → paired policy_template. Returns false on failure so the
  // modal stays open with the user's edits.
  async function handleSaveTier(
    key: string,
    nameEn: string,
    nameAr: string,
    steps: AddTierStep[],
    isEdit: boolean,
  ): Promise<boolean> {
    try {
      if (isEdit) {
        const row = rows.find((r) => r.key === key)
        if (row && !row.isDefault && (row.nameEn !== nameEn || row.nameAr !== nameAr)) {
          await updateValue(row.id, { nameEn, nameAr })
        }
      } else {
        await addEnumTier(DOMAIN, key, nameEn, nameAr)
      }
      const existing =
        policyTemplates.find((tp) => tp.approvalTier === key && (tp.defaultWorkflowSteps?.length ?? 0) > 0) ??
        policyTemplates.find((tp) => tp.approvalTier === key)
      if (existing) {
        await updatePolicyTemplate(existing.id, { name: nameEn, nameAr, defaultWorkflowSteps: steps })
      } else {
        createPolicyTemplate({
          name: nameEn,
          nameAr,
          category: 'compliance' as PolicyCategory,
          approvalTier: key as PolicyApprovalTier,
          defaultDescription: '',
          defaultWorkflowSteps: steps,
          versionPattern: 'v{major}.{minor}',
          status: 'active',
        })
      }
      setEditTier(null)
      return true
    } catch (e) {
      console.error('Failed to save approval tier', e)
      return false
    }
  }

  // Quick inline sort-order edit (saved on blur when the value actually
  // changed). Keyed by id+sortOrder so the uncontrolled input re-seeds after
  // a save reconciles.
  function saveSort(row: EnumValue, raw: string) {
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n) || n === row.sortOrder) return
    void updateValue(row.id, { sortOrder: n })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setIsDeletingTier(true)
    try {
      await removeValue(pendingDelete.id)
      const tmpl = policyTemplates.find((tp) => tp.approvalTier === pendingDelete.key)
      if (tmpl) await deletePolicyTemplate(tmpl.id)
    } catch {
      // toast shown via store.
    } finally {
      setIsDeletingTier(false)
      setPendingDelete(null)
    }
  }

  return (
    <section className={embedded ? '' : 'bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden'}>
      <div className={embedded ? 'flex items-center justify-end pb-4' : 'px-6 py-4 border-b border-slate-100 flex items-center justify-between'}>
        {!embedded && (
          <div>
            <h3 className="text-sm font-bold text-slate-900">{t('settings.enumValues.title')}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t('settings.enumValues.description')}</p>
          </div>
        )}
        <Button size="sm" variant="primary" onClick={openAdd}>
          <Icon icon="lucide:plus" className="text-sm" />
          {t('settings.enumValues.addTier')}
        </Button>
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="p-6"><ListSkeleton rows={4} columns={4} /></div>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameEn')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">{t('settings.enumValues.nameAr')}</th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <span className="inline-flex items-center gap-1">
                  {t('settings.enumValues.sortOrder')}
                  <HelpTip content={t('settings.enumValues.sortOrderHelp' as TranslationKey)} className="text-xs" />
                </span>
              </th>
              <th className="px-6 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-500 text-end">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-6 text-center text-slate-400 italic text-xs">—</td>
              </tr>
            )}
            {sorted.map((row) => {
              const usage = usageCount(row.key)
              return (
                <tr key={row.id} className="hover:bg-slate-50/60">
                  <td className="px-6 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-800">{row.nameEn}</span>
                      <span className="text-[10px] font-mono text-slate-400">{row.key}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className="text-xs text-slate-600">{row.nameAr}</span>
                  </td>
                  <td className="px-6 py-3">
                    <input
                      key={`${row.id}-${row.sortOrder}`}
                      type="number"
                      defaultValue={row.sortOrder}
                      onBlur={(e) => saveSort(row, e.target.value)}
                      className="w-16 h-7 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </td>
                  <td className="px-6 py-3">
                    <div className={`flex items-center gap-1 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      <button
                        onClick={() => void openEdit(row)}
                        className="text-slate-400 hover:text-emerald-600 p-1.5 rounded-md hover:bg-emerald-50 cursor-pointer"
                        title={t('common.edit')}
                      >
                        <Icon icon="lucide:pencil" className="text-sm" />
                      </button>
                      <button
                        onClick={() => !row.isDefault && usage === 0 && setPendingDelete({ id: row.id, key: row.key, nameEn: row.nameEn })}
                        disabled={row.isDefault || usage > 0}
                        className="p-1.5 rounded-md cursor-pointer text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                        title={row.isDefault ? t('settings.enumValues.cannotDeleteDefault') : usage > 0 ? t('settings.enumValues.inUse') : t('common.delete')}
                      >
                        <Icon icon="lucide:trash-2" className="text-sm" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Rich add/edit — the exact builder the policy create flow uses. Keyed
          so each open is a fresh mount (seeds state from editTier). */}
      {showTierModal && (
        <AddTierModal
          key={editTier?.key ?? '__add__'}
          isOpen={showTierModal}
          onClose={() => { setShowTierModal(false); setEditTier(null) }}
          onSave={handleSaveTier}
          existingKeys={existingKeys}
          editTier={editTier}
          isRTL={isRTL}
          t={t}
        />
      )}

      {/* Delete confirm */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('settings.enumValues.deleteConfirmTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{t('settings.enumValues.deleteConfirmBody')}</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={isDeletingTier}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={isDeletingTier} aria-busy={isDeletingTier || undefined} onClick={() => void confirmDelete()}>
              {isDeletingTier && <Icon icon="lucide:loader-2" className="animate-spin" />}
              {isDeletingTier ? t('common.deleting') : t('common.delete')}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  )
}
