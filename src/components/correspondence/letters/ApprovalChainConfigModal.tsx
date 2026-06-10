'use client'

// W41 — Configure the approval chain from the approval-card header.
//
// Scope choice:
//   • "This letter only"   → POST /letters/[id]/approval-chain (replaces the
//     letter's steps; review restarts from step 1)
//   • "All <AUTHORITY> letters" → PUT /letters/approval-chains (saves the
//     authority default consulted on every future submit) AND applies it to
//     the open letter when it is still in the approval lifecycle.

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { api } from '@/lib/api-client'
import type { LetterApprovalStep } from '@/types'

const MAX_STEPS = 10

export function ApprovalChainConfigModal({
  isOpen,
  onClose,
  letterId,
  letterStatus,
  authority,
  currentSteps,
  onApplied,
}: {
  isOpen: boolean
  onClose: () => void
  letterId: string
  letterStatus: string
  authority: string
  currentSteps: LetterApprovalStep[]
  onApplied: () => void
}) {
  const { t, isRTL } = useTranslation()
  const [roles, setRoles] = useState<string[]>([])
  const [scope, setScope] = useState<'letter' | 'authority'>('letter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setRoles(
      currentSteps.length > 0
        ? [...currentSteps].sort((a, b) => a.step - b.step).map((s) => s.role)
        : ['Compliance Officer', 'Department Head', 'Compliance Director'],
    )
    setScope('letter')
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const canApplyToLetter = ['draft', 'rejected', 'pending-approval'].includes(letterStatus)
  const validRoles = roles.map((r) => r.trim()).filter(Boolean)
  const canSave = validRoles.length >= 1 && validRoles.length === roles.length && !busy

  const handleSave = async () => {
    if (!canSave) return
    setBusy(true)
    setError(null)
    const steps = validRoles.map((role, i) => ({ step: i + 1, role }))
    try {
      if (scope === 'authority') {
        await api.post('/letters/approval-chains', { authority: authority.toLowerCase(), steps })
      }
      if (canApplyToLetter) {
        await api.post(`/letters/${letterId}/approval-chain`, { steps })
      }
      onApplied()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('letters.chainSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { if (!busy) onClose() }} size="md" title={t('letters.configureChain')}>
      <div className="space-y-5">
        <p className="text-sm text-slate-500">{t('letters.configureChainHint')}</p>

        {/* Steps editor */}
        <div className="space-y-2">
          {roles.map((role, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                {idx + 1}
              </span>
              <input
                value={role}
                onChange={(e) => setRoles((rs) => rs.map((r, i) => (i === idx ? e.target.value : r)))}
                placeholder={t('letters.chainStepRolePlaceholder')}
                className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setRoles((rs) => rs.filter((_, i) => i !== idx))}
                disabled={roles.length <= 1 || busy}
                className="p-2 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-30"
                title={t('common.delete')}
              >
                <Icon icon="lucide:trash-2" className="text-sm" />
              </button>
            </div>
          ))}
          {roles.length < MAX_STEPS && (
            <button
              type="button"
              onClick={() => setRoles((rs) => [...rs, ''])}
              disabled={busy}
              className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-xs font-bold text-slate-400 hover:border-emerald-300 hover:text-emerald-600 transition-colors cursor-pointer"
            >
              <Icon icon="lucide:plus" className="inline text-sm" /> {t('letters.addChainStep')}
            </button>
          )}
        </div>

        {/* Scope */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
            {t('letters.chainScope')}
          </p>
          {(
            [
              { id: 'letter' as const, label: t('letters.chainScopeLetter') },
              { id: 'authority' as const, label: t('letters.chainScopeAuthority', { authority: authority.toUpperCase() }) },
            ]
          ).map((opt) => (
            <label
              key={opt.id}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                scope === opt.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="chain-scope"
                checked={scope === opt.id}
                onChange={() => setScope(opt.id)}
                className="accent-emerald-600"
              />
              <span className="text-sm font-medium text-slate-700">{opt.label}</span>
            </label>
          ))}
        </div>

        {canApplyToLetter && letterStatus === 'pending-approval' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {t('letters.chainResetWarning')}
          </p>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className={`flex justify-end gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            aria-busy={busy || undefined}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center gap-2"
          >
            {busy && <Icon icon="lucide:loader-2" className="animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
