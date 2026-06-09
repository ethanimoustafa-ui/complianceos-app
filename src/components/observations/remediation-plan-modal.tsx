'use client'

import { useState, useRef } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { useTranslation } from '@/i18n'
import { formatBytes } from '@/lib/format'
import type { RemediationPlanStatus } from '@/types'

interface PlanDocument {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RemediationPlanInitial {
  planId: string
  title: string
  description: string
  dueDate: string
  status: RemediationPlanStatus
  reviewNotes?: string
  documents?: PlanDocument[]
}

interface RemediationPlanModalProps {
  isOpen: boolean
  onClose: () => void
  /**
   * Upload one attached file (real bytes → bucket, flagged as remediation).
   * Must reject on failure. The modal uploads files one-by-one and clears each
   * from its state on success, so a retry after a later failure never
   * re-uploads the same bytes (no duplicate documents).
   */
  onUploadFile: (file: File) => Promise<void>
  /**
   * Persist the plan with the chosen status after the files are uploaded. Must
   * reject on failure so the modal keeps the form open and surfaces the error.
   */
  onSavePlan: (
    plan: { title: string; description: string; dueDate: string },
    status: 'draft' | 'submitted',
  ) => Promise<void>
  /** Delete an already-attached plan document (server-backed). Rejects on failure. */
  onDeleteExistingDocument?: (documentId: string, documentName: string) => Promise<void> | void
  observationDueDate?: string
  /** When set, the modal edits/revises an existing draft or rejected plan. */
  initialPlan?: RemediationPlanInitial | null
}

const ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp'

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'lucide:file-text'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'lucide:image'
  return 'lucide:file'
}

export function RemediationPlanModal({
  isOpen,
  onClose,
  onUploadFile,
  onSavePlan,
  onDeleteExistingDocument,
  observationDueDate,
  initialPlan,
}: RemediationPlanModalProps) {
  const { t, isRTL } = useTranslation()
  // Already-attached docs the user has deleted in this session (so the row
  // disappears immediately even though `initialPlan` is a static prop).
  const [removedDocIds, setRemovedDocIds] = useState<string[]>([])
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null)
  // The parent mounts this modal only while open, so these initializers seed the
  // form on every open (a new mount) — no reset effect needed.
  const [title, setTitle] = useState(initialPlan?.title ?? '')
  const [description, setDescription] = useState(initialPlan?.description ?? '')
  const [dueDate, setDueDate] = useState(initialPlan?.dueDate ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'draft' | 'submit' | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isRevise = initialPlan?.status === 'rejected'
  const existingDocs = (initialPlan?.documents ?? []).filter((d) => !removedDocIds.includes(d.id))

  const handleDeleteExisting = async (docId: string, name: string) => {
    if (!onDeleteExistingDocument) return
    setDeletingDocId(docId)
    try {
      await onDeleteExistingDocument(docId, name)
      setRemovedDocIds((prev) => [...prev, docId])
    } finally {
      setDeletingDocId(null)
    }
  }

  const addFiles = (list: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(list)])
    setError('')
  }

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index))

  const validate = (status: 'draft' | 'submitted'): string | null => {
    if (!title.trim()) return t('observations.detail.remediationTitleRequired')
    if (!description.trim()) return t('observations.detail.remediationDescriptionRequired')
    if (!dueDate) return t('observations.detail.remediationDueDateRequired')
    if (observationDueDate) {
      if (new Date(dueDate) >= new Date(observationDueDate)) {
        return t('observations.detail.remediationDueDateMustBeBefore')
      }
    }
    // "The plan includes the document": require at least one document to submit
    // for review (existing OR newly attached). Drafts may be saved without one.
    if (status === 'submitted' && existingDocs.length === 0 && files.length === 0) {
      return t('observations.detail.remediationDocumentRequired')
    }
    return null
  }

  const handleSave = async (status: 'draft' | 'submitted') => {
    const validationError = validate(status)
    if (validationError) {
      setError(validationError)
      return
    }
    setBusy(status === 'submitted' ? 'submit' : 'draft')
    try {
      // Upload each not-yet-uploaded file, clearing it from state on success so
      // a retry after a later failure never re-uploads the same bytes.
      for (const file of [...files]) {
        await onUploadFile(file)
        setFiles((prev) => prev.filter((f) => f !== file))
      }
      await onSavePlan({ title: title.trim(), description: description.trim(), dueDate }, status)
      onClose()
    } catch {
      // Parent surfaces a toast; keep the form open so the user can retry.
      setError(t('observations.detail.remediationSaveFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={busy ? () => {} : onClose} size="md">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Icon icon="lucide:clipboard-check" className="text-emerald-600 text-xl" />
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <h2 className="text-lg font-bold text-slate-900">
              {isRevise
                ? t('observations.detail.reviseRemediationPlan')
                : initialPlan
                  ? t('observations.detail.editRemediationPlan')
                  : t('observations.detail.createRemediationPlan')}
            </h2>
            <p className="text-sm text-slate-500">
              {t('observations.detail.submitRemediationPlanDescription')}
            </p>
          </div>
        </div>

        {/* Reviewer feedback when revising a rejected plan */}
        {isRevise && initialPlan?.reviewNotes ? (
          <div className={`mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm ${isRTL ? 'text-right' : ''}`}>
            <p className="text-xs font-bold text-rose-700 uppercase tracking-wide mb-1">
              {t('observations.detail.reviewNotes')}
            </p>
            <p className="text-rose-700">{initialPlan.reviewNotes}</p>
          </div>
        ) : null}

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-sm text-rose-700">
            <Icon icon="lucide:alert-circle" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.remediationTitle')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder={t('observations.detail.remediationTitlePlaceholder')}
              disabled={busy !== null}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 ${isRTL ? 'text-right' : ''}`}
            />
          </div>

          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.remediationDescription')}
            </label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError('') }}
              placeholder={t('observations.detail.remediationDescriptionPlaceholder')}
              rows={4}
              disabled={busy !== null}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none disabled:opacity-60 ${isRTL ? 'text-right' : ''}`}
            />
          </div>

          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.planDueDate')}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => { setDueDate(e.target.value); setError('') }}
              disabled={busy !== null}
              className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 ${isRTL ? 'text-right' : ''}`}
            />
            {observationDueDate && (
              <p className={`text-xs text-slate-400 mt-1 ${isRTL ? 'text-right' : ''}`}>
                {t('observations.detail.mustBeBeforeObservationDue', { date: observationDueDate })}
              </p>
            )}
          </div>

          {/* Plan document(s) — the actual remediation evidence */}
          <div>
            <label className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.detail.planDocuments')}
            </label>

            {existingDocs.length > 0 && (
              <div className="space-y-2 mb-2">
                {existingDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <Icon icon={fileIcon(doc.name)} className="text-amber-600 shrink-0" />
                    <span className="text-xs font-bold text-amber-800 truncate flex-1">{doc.name}</span>
                    <span className="text-[10px] text-amber-500 uppercase font-bold shrink-0">{t('observations.detail.attached')}</span>
                    {onDeleteExistingDocument && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExisting(doc.id, doc.name)}
                        disabled={deletingDocId !== null || busy !== null}
                        className="p-1 text-amber-400 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default shrink-0"
                        title={t('observations.detail.deleteDocument')}
                        aria-label={t('observations.detail.deleteDocument')}
                      >
                        <Icon
                          icon={deletingDocId === doc.id ? 'lucide:loader-2' : 'lucide:trash-2'}
                          className={deletingDocId === doc.id ? 'animate-spin' : ''}
                        />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <div className="space-y-2 mb-2">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <Icon icon={fileIcon(file.name)} className="text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      disabled={busy !== null}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50"
                    >
                      <Icon icon="lucide:x" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) addFiles(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== null}
              className="w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Icon icon="lucide:paperclip" />
              {t('observations.detail.attachDocument')}
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" onClick={onClose} disabled={busy !== null} className="flex-1">
            {t('common.cancel')}
          </Button>
          <LoadingButton
            variant="ghost"
            onClick={() => handleSave('draft')}
            loading={busy === 'draft'}
            disabled={busy !== null}
            className="flex-1 border border-slate-300 text-slate-700"
          >
            {t('observations.detail.saveDraft')}
          </LoadingButton>
          <LoadingButton
            variant="primary"
            onClick={() => handleSave('submitted')}
            loading={busy === 'submit'}
            disabled={busy !== null}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
          >
            {t('observations.detail.submitForReview')}
          </LoadingButton>
        </div>
      </div>
    </Modal>
  )
}
