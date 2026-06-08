'use client'
// ISSUE-4: Add a custom approval tier (name + default workflow steps) from the
// Policy Create modal. The parent persists it as an enum_value_definitions row
// (the dropdown option) plus a paired policy_template whose default_workflow_steps
// hold the seed steps. This component only collects the data and calls onSave.

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

export type AddTierStep = { step: string; description: string; actionType: string }

type Props = {
  isOpen: boolean
  onClose: () => void
  onSave: (key: string, nameEn: string, nameAr: string, steps: AddTierStep[]) => Promise<void> | void
  existingKeys: string[]
  t: (key: any, params?: Record<string, string>) => string
}

const ACTION_TYPES = ['move-to-next', 'send-email', 'notify-manager', 'request-approval', 'send-for-review'] as const

export function AddTierModal({ isOpen, onClose, onSave, existingKeys, t }: Props) {
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [steps, setSteps] = useState<AddTierStep[]>([])
  const [isSaving, setIsSaving] = useState(false)

  // Derive a stable storage key from the English name (lowercase + underscores).
  const key = nameEn.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const keyTaken = !!key && existingKeys.includes(key)
  const valid = !!nameEn.trim() && !!key && !keyTaken

  const actionLabel = (a: string) => {
    switch (a) {
      case 'send-email': return t('policies.actionSendEmail')
      case 'notify-manager': return t('policies.actionNotifyManager')
      case 'request-approval': return t('policies.actionRequestApproval')
      case 'send-for-review': return t('policies.actionSendForReview')
      default: return t('policies.actionMoveToNext')
    }
  }

  function reset() { setNameEn(''); setNameAr(''); setSteps([]) }
  function close() { if (isSaving) return; reset(); onClose() }

  async function handleSave() {
    if (!valid || isSaving) return
    setIsSaving(true)
    try {
      const clean = steps
        .filter((s) => s.step.trim())
        .map((s) => ({ step: s.step.trim(), description: s.description.trim(), actionType: s.actionType }))
      await onSave(key, nameEn.trim(), nameAr.trim() || nameEn.trim(), clean)
      reset()
      onClose()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={t('policies.addTierTitle')} size="lg">
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
                  <span className="text-[10px] font-bold text-slate-400 mt-2.5 w-4 text-center shrink-0">{i + 1}</span>
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
                      <select
                        value={s.actionType}
                        onChange={(e) => setSteps((arr) => arr.map((st, idx) => (idx === i ? { ...st, actionType: e.target.value } : st)))}
                        className="h-8 rounded-md border border-slate-200 px-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        {ACTION_TYPES.map((a) => (
                          <option key={a} value={a}>{actionLabel(a)}</option>
                        ))}
                      </select>
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
            {t('policies.addTierSave')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
