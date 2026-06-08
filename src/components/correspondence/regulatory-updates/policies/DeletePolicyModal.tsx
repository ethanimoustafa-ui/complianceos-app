'use client'
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { usePolicyStore } from '@/stores/policy-store'

type Props = {
  isOpen: boolean
  onClose: () => void
  targetId: string | null
  onDeleted: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
}

export function DeletePolicyModal({ isOpen, onClose, targetId, onDeleted, t }: Props) {
  const { delete: deletePolicy } = usePolicyStore()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    if (!targetId || isDeleting) return
    setIsDeleting(true)
    try {
      // Wait for the server DELETE to confirm before closing + toasting, so the
      // success message no longer fires while the row is still in the list.
      const ok = await deletePolicy(targetId)
      if (ok) onDeleted(t('policies.policyDeleted'))
      // On failure the store surfaces an error toast; keep the modal open to retry.
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={isDeleting ? () => {} : onClose} title={t('policies.deletePolicy')} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('policies.confirmDeletePolicy')}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={isDeleting}>{t('common.cancel')}</Button>
          <Button variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50" onClick={handleDelete} disabled={isDeleting} aria-busy={isDeleting || undefined}>
            <Icon icon={isDeleting ? 'lucide:loader-2' : 'lucide:trash-2'} className={`w-4 h-4${isDeleting ? ' animate-spin' : ''}`} />
            {isDeleting ? t('common.deleting') : t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
