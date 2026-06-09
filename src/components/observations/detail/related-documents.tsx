'use client'

import { memo, useState } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { Skeleton } from '@/components/ui/skeleton'

interface Document {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RelatedDocumentsProps {
  documents: Document[]
  canUpload: boolean
  onUpload: () => void
  /** Resolve + open a stored document in a new tab. */
  onOpenDocument?: (documentId: string) => Promise<void> | void
  /** Delete a stored document (gated by upload permission). */
  onDeleteDocument?: (documentId: string, documentName: string) => Promise<void> | void
  isRTL?: boolean
  /** Render skeleton rows when the detail GET hasn't resolved yet. */
  isLoaded?: boolean
}

export const RelatedDocuments = memo(function RelatedDocuments({
  documents,
  canUpload,
  onUpload,
  onOpenDocument,
  onDeleteDocument,
  isLoaded = true,
}: RelatedDocumentsProps) {
  const { t } = useTranslation()
  const [opening, setOpening] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleOpen = async (id: string) => {
    if (!onOpenDocument) return
    setOpening(id)
    try {
      await onOpenDocument(id)
    } finally {
      setOpening(null)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!onDeleteDocument) return
    setDeleting(id)
    try {
      await onDeleteDocument(id, name)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.relatedDocuments')}
      </h4>
      {!isLoaded ? (
        <div className="space-y-2 mb-3" data-testid="observation-documents-skeleton" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
      ) : documents.length > 0 ? (
        <div className="space-y-2 mb-3">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className={`flex items-center gap-1 p-2 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 transition-all`}
            >
              <button
                type="button"
                onClick={() => handleOpen(doc.id)}
                disabled={!onOpenDocument || opening !== null}
                title={t('observations.detail.openDocument')}
                className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer disabled:opacity-70 disabled:cursor-default"
              >
                <Icon
                  icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
                  className={doc.type === 'pdf' ? 'text-emerald-500' : doc.type === 'image' ? 'text-blue-500' : 'text-slate-500'}
                />
                <span className={`text-[10px] font-bold text-slate-700 truncate flex-1`}>
                  {doc.name}
                </span>
                <Icon
                  icon={opening === doc.id ? 'lucide:loader-2' : 'lucide:external-link'}
                  className={`text-slate-400 shrink-0 ${opening === doc.id ? 'animate-spin' : ''}`}
                />
              </button>
              {onDeleteDocument && (
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id, doc.name)}
                  disabled={deleting !== null}
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default shrink-0"
                  title={t('observations.detail.deleteDocument')}
                  aria-label={t('observations.detail.deleteDocument')}
                >
                  <Icon
                    icon={deleting === doc.id ? 'lucide:loader-2' : 'lucide:trash-2'}
                    className={deleting === doc.id ? 'animate-spin' : ''}
                  />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {canUpload ? (
        <button
          onClick={onUpload}
          className={`w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2`}
        >
          <Icon icon="lucide:upload" />
          {t('observations.detail.uploadDocument')}
        </button>
      ) : isLoaded && documents.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center">{t('observations.detail.noDocuments')}</p>
      ) : null}
    </div>
  )
})
