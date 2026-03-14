'use client'

import { useState, useRef, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'

interface FileUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (files: File[], addToRemediationPlan: boolean) => void
}

export function FileUploadModal({
  isOpen,
  onClose,
  onConfirm,
}: FileUploadModalProps) {
  const { t, isRTL } = useTranslation()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [addToRemediationPlan, setAddToRemediationPlan] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFiles([])
      setAddToRemediationPlan(false)
      setIsDragging(false)
    }
  }, [isOpen])

  const handleFilesSelect = (files: FileList | File[]) => {
    const newFiles = Array.from(files)
    setSelectedFiles((prev) => [...prev, ...newFiles])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelect(e.target.files)
    }
    // Reset input value so same file can be selected again
    e.target.value = ''
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleConfirm = () => {
    if (selectedFiles.length > 0) {
      onConfirm(selectedFiles, addToRemediationPlan)
      // Reset state
      setSelectedFiles([])
      setAddToRemediationPlan(false)
    }
  }

  const handleClose = () => {
    setSelectedFiles([])
    setAddToRemediationPlan(false)
    onClose()
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'lucide:file-text'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'lucide:image'
    if (['doc', 'docx'].includes(ext || '')) return 'lucide:file-text'
    return 'lucide:file'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="p-6">
        <div className={`flex items-center gap-3 mb-6`}>
          <div className="p-2 bg-emerald-100 rounded-lg">
            <Icon icon="lucide:upload" className="text-xl text-emerald-600" />
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <h3 className="text-lg font-bold text-slate-900">
              {t('observations.detail.uploadDocument')}
            </h3>
            <p className="text-sm text-slate-500">
              {t('observations.detail.uploadDocumentDescription')}
            </p>
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleInputChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
            className="hidden"
          />
          <Icon icon="lucide:cloud-upload" className="text-4xl text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-600">
            {t('observations.detail.dropFileHere')}{' '}
            <span className="text-emerald-600 font-medium">{t('observations.detail.browse')}</span>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {t('observations.detail.multipleFilesAllowed')}
          </p>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className={`flex items-center gap-3 p-2 bg-slate-50 rounded-lg`}
              >
                <Icon icon={getFileIcon(file.name)} className="text-xl text-emerald-500 shrink-0" />
                <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
                  <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveFile(index)
                  }}
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                >
                  <Icon icon="lucide:x" className="text-lg" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add to Remediation Plan Checkbox - Always show */}
        <label className={`flex items-center gap-3 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer hover:bg-amber-100 transition-colors`}>
          <input
            type="checkbox"
            checked={addToRemediationPlan}
            onChange={(e) => setAddToRemediationPlan(e.target.checked)}
            className="w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
          />
          <div className={isRTL ? 'text-right' : ''}>
            <p className="text-sm font-medium text-amber-800">
              {t('observations.detail.addToRemediationPlan')}
            </p>
            <p className="text-xs text-amber-600">
              {t('observations.detail.addToRemediationPlanDescription')}
            </p>
          </div>
        </label>

        {/* Actions */}
        <div className={`flex gap-3 mt-6`}>
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedFiles.length === 0}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('observations.detail.uploadFiles', { count: selectedFiles.length })}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function getFileType(fileName: string): 'pdf' | 'image' | 'doc' {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image'
  return 'doc'
}
