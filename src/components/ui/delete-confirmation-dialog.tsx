'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { pushToast } from '@/stores/toast-store'
import { useTranslation } from '@/i18n'

interface DeleteConfirmationDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
  title?: string
  description?: string
  itemName?: string
  itemType?: string
  confirmText?: string
  cancelText?: string
  requireConfirmation?: boolean
  confirmationWord?: string
}

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName,
  itemType = 'item',
  confirmText,
  cancelText,
  requireConfirmation = false,
  confirmationWord = 'DELETE',
}: DeleteConfirmationDialogProps) {
  const { t } = useTranslation()
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmationInput, setConfirmationInput] = useState('')

  const defaultTitle = title || t('common.deleteConfirmTitle', { type: itemType })
  const defaultDescription =
    description ||
    t('common.deleteConfirmDescription', { name: itemName || t('common.thisItem') })

  const canDelete = !requireConfirmation || confirmationInput === confirmationWord

  const handleConfirm = async () => {
    if (!canDelete) return

    setIsDeleting(true)
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      console.error('Delete failed:', error)
      // Keep the dialog open and tell the user it didn't go through so they can
      // try again — previously the failure was only logged to the console.
      pushToast({ key: 'errors.deleteFailed' }, 'error')
    } finally {
      setIsDeleting(false)
      setConfirmationInput('')
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmationInput('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm">
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-6">
          <Icon icon="lucide:trash-2" className="text-3xl text-rose-600" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">{defaultTitle}</h2>

        <p className="text-sm text-slate-500 mb-6 max-w-sm">{defaultDescription}</p>

        {requireConfirmation && (
          <div className="w-full mb-6">
            <p className="text-xs text-slate-600 mb-2">
              {t('common.typeToConfirm', { word: confirmationWord })}
            </p>
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder={confirmationWord}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent text-center font-mono"
              disabled={isDeleting}
            />
          </div>
        )}

        <div className="flex gap-3 w-full">
          <Button variant="ghost" onClick={handleClose} disabled={isDeleting} className="flex-1">
            {cancelText || t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!canDelete || isDeleting}
            className="flex-1 bg-rose-600 hover:bg-rose-700"
          >
            {isDeleting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('common.deleting')}
              </>
            ) : (
              confirmText || t('common.delete')
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
