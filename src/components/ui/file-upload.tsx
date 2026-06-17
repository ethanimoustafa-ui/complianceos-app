'use client'

import { useRef, useState, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  progress: number
  status: 'uploading' | 'complete' | 'error'
  file?: File
}

interface FileUploadProps {
  /** Accepted file types (e.g., ".pdf,.doc,.docx") */
  accept?: string
  /** Allow multiple files */
  multiple?: boolean
  /** Max file size in bytes (default 10MB) */
  maxSize?: number
  /** Called when files are selected/changed */
  onChange?: (files: UploadedFile[]) => void
  /** Current files */
  files?: UploadedFile[]
  /** Disabled state */
  disabled?: boolean
  /** Custom class name */
  className?: string
  /** Label text */
  label?: string
  /** Helper text */
  helperText?: string
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileIcon(type: string): string {
  if (type.includes('pdf')) return 'lucide:file-text'
  if (type.includes('image')) return 'lucide:image'
  if (type.includes('word') || type.includes('document')) return 'lucide:file-text'
  if (type.includes('excel') || type.includes('spreadsheet')) return 'lucide:file-spreadsheet'
  if (type.includes('zip') || type.includes('archive')) return 'lucide:file-archive'
  return 'lucide:file'
}

export function FileUpload({
  accept = '*',
  multiple = false,
  maxSize = 10 * 1024 * 1024, // 10MB default
  onChange,
  files = [],
  disabled = false,
  className,
  label,
  helperText,
}: FileUploadProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click()
    }
  }

  const processFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return

      setError(null)
      const newFiles: UploadedFile[] = []

      Array.from(fileList).forEach((file) => {
        // Check file size — a clear, non-blaming message that names the file and
        // the limit, and tells the user what to do next.
        if (file.size > maxSize) {
          setError(t('upload.tooLargeNamed', { name: file.name, max: formatFileSize(maxSize) }))
          return
        }

        const uploadedFile: UploadedFile = {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          type: file.type,
          progress: 100, // Simulating instant upload for local preview
          status: 'complete',
          file,
        }

        newFiles.push(uploadedFile)
      })

      if (newFiles.length > 0) {
        const updatedFiles = multiple ? [...files, ...newFiles] : newFiles
        onChange?.(updatedFiles)
      }
    },
    [files, maxSize, multiple, onChange, t]
  )

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files)
    // Reset input so the same file can be selected again
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (!disabled) {
      processFiles(e.dataTransfer.files)
    }
  }

  const removeFile = (fileId: string) => {
    const updatedFiles = files.filter((f) => f.id !== fileId)
    onChange?.(updatedFiles)
  }

  return (
    <div className={className}>
      {label && (
        <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
          {label}
        </label>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Drop zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer',
          isDragging
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30',
          disabled && 'opacity-50 cursor-not-allowed hover:border-slate-200 hover:bg-transparent'
        )}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Icon
              icon={isDragging ? 'lucide:download' : 'lucide:upload-cloud'}
              className={cn('text-2xl', isDragging ? 'text-emerald-600' : 'text-slate-400')}
            />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-700">
              {isDragging ? 'Drop files here' : 'Click to upload or drag and drop'}
            </p>
            {helperText && <p className="text-xs text-slate-500 mt-1">{helperText}</p>}
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center gap-1 text-rose-600 text-xs">
          <Icon icon="lucide:alert-circle" />
          <span>{error}</span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl"
            >
              <div
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  file.type.includes('pdf')
                    ? 'bg-rose-50 text-rose-600'
                    : file.type.includes('image')
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-slate-100 text-slate-600'
                )}
              >
                <Icon icon={getFileIcon(file.type)} className="text-xl" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>

                {/* Progress bar for uploading files */}
                {file.status === 'uploading' && (
                  <div className="mt-1 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${file.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Status icon / Remove button */}
              <div className="flex items-center gap-2">
                {file.status === 'uploading' && (
                  <Icon icon="lucide:loader-2" className="text-slate-400 animate-spin" />
                )}
                {file.status === 'complete' && (
                  <Icon icon="lucide:check-circle" className="text-emerald-500" />
                )}
                {file.status === 'error' && (
                  <Icon icon="lucide:alert-circle" className="text-rose-500" />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(file.id)
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <Icon icon="lucide:x" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
