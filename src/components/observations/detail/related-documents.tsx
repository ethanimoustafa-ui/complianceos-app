'use client'

import { memo } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'

interface Document {
  id: string
  name: string
  type: 'pdf' | 'image' | 'doc'
}

export interface RelatedDocumentsProps {
  documents: Document[]
  canUpload: boolean
  onUpload: () => void
  isRTL?: boolean
}

export const RelatedDocuments = memo(function RelatedDocuments({
  documents,
  canUpload,
  onUpload,
}: RelatedDocumentsProps) {
  const { t } = useTranslation()

  return (
    <div>
      <h4 className={`text-xs font-black uppercase text-slate-500 tracking-widest mb-4`}>
        {t('observations.detail.relatedDocuments')}
      </h4>
      {documents.length > 0 ? (
        <div className="space-y-2 mb-3">
          {documents.map((doc) => (
            <a
              key={doc.id}
              href="#"
              className={`flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 transition-all`}
            >
              <Icon
                icon={doc.type === 'pdf' ? 'lucide:file-text' : doc.type === 'image' ? 'lucide:image' : 'lucide:file'}
                className={doc.type === 'pdf' ? 'text-emerald-500' : doc.type === 'image' ? 'text-blue-500' : 'text-slate-500'}
              />
              <span className={`text-[10px] font-bold text-slate-700 truncate`}>
                {doc.name}
              </span>
            </a>
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
      ) : documents.length === 0 ? (
        <p className="text-xs text-slate-400 italic text-center">{t('observations.detail.noDocuments')}</p>
      ) : null}
    </div>
  )
})
