'use client'
// ISSUE-4 / W37: Add OR EDIT a custom approval tier (name + default workflow
// steps) from the Policy Create modal. The parent persists it as an
// enum_value_definitions row (the dropdown option) plus a paired policy_template
// whose default_workflow_steps hold the seed steps. This component collects the
// data and calls onSave; in edit mode it is pre-filled with the tier's current
// name + steps and the key is fixed.

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { EditableSelect } from '@/components/ui/editable-select'

export type AddTierStep = { step: string; description: string; actionType: string }

export type EditTier = { key: string; nameEn: string; nameAr: string; steps: AddTierStep[] }

type Props = {
  isOpen: boolean
  onClose: () => void
  /** isEdit is true when saving an existing tier (key is fixed). Return false
   *  (or a rejected promise) to signal failure so the modal stays open. */
  onSave: (key: string, nameEn: string, nameAr: string, steps: AddTierStep[], isEdit: boolean) => Promise<boolean | void> | boolean | void
  existingKeys: string[]
  /** When set, the modal opens in EDIT mode pre-filled with this tier. */
  editTier?: EditTier | null
  isRTL?: boolean
  t: (key: any, params?: Record<string, string>) => string
}

// Canonical, de-duplicated action set the user can choose from (W37 product
// call: "collapse the redundant ones"). Legacy/seeded types are normalized to
// these when editing a tier (see openEditTier in RegisterPolicyModal):
//   send-for-review / approve / vote_approve → request-approval ("Submit for Approval")
//   publish → review_complete ("Complete Step")
// Exported so callers can validate/normalize DB-sourced action types.
export const ACTION_TYPES = [
  'move-to-next', 'review_complete', 'send-email', 'notify-manager', 'request-approval',
] as const

export function AddTierModal({ isOpen, onClose, onSave, existingKeys, editTier, isRTL = false, t }: Props) {
  const isEdit = !!editTier
  // State is seeded from props at mount. The parent CONDITIONALLY MOUNTS this
  // modal (and keys it by tier), so each open is a fresh mount — no effect
  // needed to re-seed when switching between add and edit.
  const [nameEn, setNameEn] = useState(editTier?.nameEn ?? '')
  const [nameAr, setNameAr] = useState(editTier?.nameAr ?? '')
  const [steps, setSteps] = useState<AddTierStep[]>(editTier?.steps ?? [])
  const [isSaving, setIsSaving] = useState(false)

  const actionLabel = (a: string) => {
    switch (a) {
      case 'send-email': return t('policies.actionSendEmail')
      case 'notify-manager': return t('policies.actionNotifyManager')
      case 'request-approval': return t('policies.submitForApproval')
      case 'review_complete': return t('policies.actionCompleteStep')
      default: return t('policies.actionMoveToNext')
    }
  }
  const actionItems = ACTION_TYPES.map((a) => ({ id: a, label: actionLabel(a) }))

  // In edit mode the key is immutable (it is the stored approval_tier on every
  // policy that uses it); only the display name + steps change. In add mode the
  // key is derived from the English name.
  const derivedKey = nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const key = isEdit ? editTier!.key : derivedKey
  const keyTaken = !isEdit && !!derivedKey && existingKeys.includes(derivedKey)
  const valid = !!nameEn.trim() && (isEdit || (!!derivedKey && !keyTaken))

  function reset() { setNameEn(''); setNameAr(''); setSteps([]) }
  function close() { if (isSaving) return; reset(); onClose() }

  function moveStep(i: number, dir: -1 | 1) {
    setSteps((arr) => {
      const j = i + dir
      if (j < 0 || j >= arr.length) return arr
      const copy = [...arr]
      const [moved] = copy.splice(i, 1)
      copy.splice(j, 0, moved)
      return copy
    })
  }

  async function handleSave() {
    if (!valid || isSaving) return
    setIsSaving(true)
    try {
      const clean = steps
        .filter((s) => s.step.trim())
        .map((s) => ({ step: s.step.trim(), description: s.description.trim(), actionType: s.actionType }))
      // Only close on confirmed success — a false result (or a throw) means the
      // save failed, so keep the modal open with the user's edits intact.
      const ok = await onSave(key, nameEn.trim(), nameAr.trim() || nameEn.trim(), clean, isEdit)
      if (ok === false) return
      reset()
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={isEdit ? t('policies.editTierTitle') : t('policies.addTierTitle')} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">{t('policies.addTierNameEn')} *</label>
            <input
              autoFocus
              value={nameEn}
              onChange={(e) => setNameEn(e.target.value)}
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">{t('policies.addTierNameAr')}</label>
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              dir="rtl"
              className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {key && (
          <p className={`text-[11px] ${keyTaken ? 'text-rose-600' : 'text-slate-400'}`}>
            {t('policies.addTierKeyLabel')}: <span className="font-mono">{key}</span>
            {keyTaken ? ` — ${t('policies.addTierKeyTaken')}` : ''}
            {isEdit ? ` (${t('policies.addTierKeyLocked')})` : ''}
          </p>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('policies.addTierSteps')}</label>
            <button
              type="button"
              onClick={() => setSteps((s) => [...s, { step: '', description: '', actionType: 'move-to-next' }])}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
            >
              <Icon icon="lucide:plus" className="text-sm" />
              {t('policies.addTierAddStep')}
            </button>
          </div>
          {steps.length === 0 ? (
            <p className="text-xs text-slate-400 italic">{t('policies.addTierNoSteps')}</p>
          ) : (
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  {/* W37: up/down reorder (was impossible before) */}
                  <div className="flex flex-col shrink-0 mt-0.5">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                      title={t('regulatoryUpdates.moveStepUp')}
                      aria-label={t('regulatoryUpdates.moveStepUp')}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed leading-none"
                    >
                      <Icon icon="lucide:chevron-up" className="text-xs" />
                    </button>
                    <span className="text-[10px] font-bold text-slate-400 w-4 text-center">{i + 1}</span>
                    <button
                      type="button"
                      disabled={i === steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                      title={t('regulatoryUpdates.moveStepDown')}
                      aria-label={t('regulatoryUpdates.moveStepDown')}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed leading-none"
                    >
                      <Icon icon="lucide:chevron-down" className="text-xs" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input
                      value={s.step}
                      onChange={(e) => setSteps((arr) => arr.map((st, idx) => (idx === i ? { ...st, step: e.target.value } : st)))}
                      placeholder={t('policies.addTierStepName')}
                      className="w-full h-8 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <div className="flex gap-1.5">
                      <input
                        value={s.description}
                        onChange={(e) => setSteps((arr) => arr.map((st, idx) => (idx === i ? { ...st, description: e.target.value } : st)))}
                        placeholder={t('policies.addTierStepDesc')}
                        className="flex-1 h-8 rounded-md border border-slate-200 px-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />
                      {/* W37: action-type now uses the shared EditableSelect (was a raw <select>) */}
                      <div className="w-44 shrink-0">
                        <EditableSelect
                          locked
                          size="sm"
                          value={s.actionType}
                          onChange={(id) => setSteps((arr) => arr.map((st, idx) => (idx === i ? { ...st, actionType: id } : st)))}
                          items={actionItems}
                          isRTL={isRTL}
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSteps((arr) => arr.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-400 hover:text-rose-600 mt-1.5 shrink-0"
                    title={t('common.delete')}
                  >
                    <Icon icon="lucide:trash-2" className="text-xs" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={close} disabled={isSaving}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={!valid || isSaving}
            aria-busy={isSaving || undefined}
          >
            <Icon icon={isSaving ? 'lucide:loader-2' : 'lucide:check'} className={`w-4 h-4${isSaving ? ' animate-spin' : ''}`} />
            {isEdit ? t('common.saveChanges') : t('policies.addTierSave')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
