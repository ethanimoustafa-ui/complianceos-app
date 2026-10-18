'use client'

import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import { formatBytes } from '@/lib/format/bytes'

interface FileUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (files: File[]) => Promise<void> | void
}

export function FileUploadModal({
  isOpen,
  onClose,
  onConfirm,
}: FileUploadModalProps) {
  const { t, isRTL } = useTranslation()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  // O1: track upload in-flight state to show spinner
  const [isUploading, setIsUploading] = useState(false)
  // Inline error for a rejected file (too large) or a failed upload.
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The parent mounts this modal only while open, so state starts fresh on each
  // open (a new mount) — no reset effect needed.

  // 50 MB ceiling — mirrors the observation_documents Storage bucket
  // (migration 025). Pre-checking here gives the user a clear message before the
  // upload starts instead of an invisible failure once the bucket rejects it.
  const MAX_DOC_BYTES = 52_428_800

  const handleFilesSelect = (files: FileList | File[]) => {
    const valid: File[] = []
    let rejection: string | null = null
    for (const file of Array.from(files)) {
      if (file.size > MAX_DOC_BYTES) {
        rejection = rejection ?? t('upload.tooLargeNamed', { name: file.name, max: formatBytes(MAX_DOC_BYTES, 0) })
        continue
      }
      valid.push(file)
    }
    if (valid.length > 0) setSelectedFiles((prev) => [...prev, ...valid])
    setError(rejection)
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

  const handleConfirm = async () => {
    if (selectedFiles.length === 0) return
    setError(null)
    setIsUploading(true)
    try {
      await onConfirm(selectedFiles)
      // Reset state after successful upload
      setSelectedFiles([])
    } catch (err) {
      // Surface a friendly, actionable message instead of letting the failure
      // bubble up invisibly (uploadDocument rejects on a too-large/blocked file).
      console.error('[FileUploadModal] upload failed:', err)
      setError(t('upload.filesFailed'))
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    setSelectedFiles([])
    setError(null)
    onClose()
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return 'lucide:file-text'
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'lucide:image'
    if (['doc', 'docx'].includes(ext || '')) return 'lucide:file-text'
    return 'lucide:file'
  }

  const formatFileSize = (bytes: number) => formatBytes(bytes)

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
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp"
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

        {/* Inline error — rejected file (too large) or a failed upload. */}
        {error && (
          <div
            role="alert"
            className={`mt-4 flex items-center gap-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-700 ${isRTL ? 'flex-row-reverse text-right' : ''}`}
          >
            <Icon icon="lucide:alert-circle" className="text-base shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className={`flex gap-3 mt-6`}>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedFiles.length === 0 || isUploading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUploading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin text-base" />
                {t('common.saving')}
              </>
            ) : (
              t('observations.detail.uploadFiles', { count: selectedFiles.length })
            )}
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
