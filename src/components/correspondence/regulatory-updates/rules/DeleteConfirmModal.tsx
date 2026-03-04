'use client'

import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'

type Props = {
  isOpen: boolean
  onClose: () => void
  targetId: string | null
  onDeleted: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
}

export function DeleteConfirmModal({ isOpen, onClose, targetId, onDeleted, t }: Props) {
  const { delete: deleteCircular } = useCircularStore()

  function handleDelete() {
    if (!targetId) return
    deleteCircular(targetId)
    onDeleted(t('regulatoryUpdates.circularDeleted'))
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('regulatoryUpdates.deleteCircular')}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('regulatoryUpdates.confirmDelete')}</p>
        <div className={`flex justify-end gap-3`}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="outline"
            className="border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={handleDelete}
          >
            <Icon icon="lucide:trash-2" className="w-4 h-4" />
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
