'use client'

import { useState, useEffect, useRef } from 'react'
import { Icon } from '@iconify/react'
import { useTranslation } from '@/i18n'
import { useLetterTypeStore } from '@/stores/letter-type-store'
import { useFrameworkSubCategoryStore } from '@/stores/framework-sub-category-store'
import { EditableSelect } from '@/components/ui/editable-select'
import { PlaceholderDefEditor } from '@/components/correspondence/letter-placeholders/PlaceholderDefEditor'
import { getDefaultDepartmentId } from '@/lib/letter-authority'
import { reconcilePlaceholderDefs } from '@/lib/letter-placeholders'
import { supabase as supabaseClient } from '@/lib/supabase/client'
import { pushToast } from '@/stores/toast-store'
import type {
  LetterTemplate,
  TemplateStatus,
  CircularAuthority,
  PlaceholderDef,
} from '@/types'
import { DynamicAuthoritySelect } from './DynamicAuthoritySelect'
import { EditableAuthorityDeptField } from './EditableAuthorityDeptField'
import { getRecipientDefaults } from './letter-helpers'

// W41: dedicated PUBLIC bucket for signatures (migration 091). Public URLs are
// stable — the previous 1-year signed URLs against the private attachments
// bucket expired/re-minted unpredictably, which is what produced the broken
// "Couldn't load the signature image" state.
const SIGNATURE_BUCKET = 'letter_signatures'

// Signature image guardrails — surfaced to the user BEFORE upload so they get a
// clear "this is too big / wrong type" message instead of a generic failure.
const SIGNATURE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const SIGNATURE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']

// Template Edit Form Component
export function TemplateEditForm({
  template,
  onClose,
  onSave,
}: {
  template: LetterTemplate | null
  onClose: () => void
  onSave: (data: Partial<LetterTemplate>) => void | Promise<void>
}) {
  const { t, isRTL } = useTranslation()
  const letterTypeStore = useLetterTypeStore()
  const [activeTab, setActiveTab] = useState<'basic' | 'content' | 'signer' | 'recipient'>('basic')
  const [name, setName] = useState(template?.name || '')
  // BUG-R3-05: `setType` widened to `string` (option (a)). The Letter Type
  // picker is now an EditableSelect bound to `useLetterTypeStore`, so the
  // saved id can be a user-added type ("internal-memo") that doesn't fit the
  // legacy literal union. `LetterType` is already widened to `string` in
  // `src/types/index.ts`, so this is a no-op widening for the local setter.
  const [type, setType] = useState<string>(template?.type || 'non-objection')
  const [description, setDescription] = useState(template?.description || '')
  const [status, setStatus] = useState<TemplateStatus>(template?.status || 'Draft')
  // L2: icon + color pickers
  const [selectedIcon, setSelectedIcon] = useState<string>(template?.icon || 'lucide:file-text')
  const [selectedColor, setSelectedColor] = useState<string>(template?.color || '#64748B')
  const [defaultSubjectEn, setDefaultSubjectEn] = useState(template?.defaultSubjectEn || '')
  const [defaultSubjectAr, setDefaultSubjectAr] = useState(template?.defaultSubjectAr || '')
  const [defaultBodyEn, setDefaultBodyEn]       = useState(template?.defaultBodyEn || '')
  const [defaultBodyAr, setDefaultBodyAr]       = useState(template?.defaultBodyAr || '')
  const [defaultSignerName, setDefaultSignerName]       = useState(template?.defaultSignerName || '')
  const [defaultSignerTitle, setDefaultSignerTitle]     = useState(template?.defaultSignerTitle || '')
  const [defaultSignerNameAr, setDefaultSignerNameAr]   = useState(template?.defaultSignerNameAr || '')
  const [defaultSignerTitleAr, setDefaultSignerTitleAr] = useState(template?.defaultSignerTitleAr || '')
  const [defaultSignatureImageUrl, setDefaultSignatureImageUrl] = useState(template?.defaultSignatureImageUrl || '')
  const [defaultAuthority, setDefaultAuthority] = useState<CircularAuthority>(template?.defaultAuthority || 'sama')
  const [defaultSamaDepartment, setDefaultSamaDepartment] = useState<string>(
    template?.defaultSamaDepartment || getDefaultDepartmentId(template?.defaultAuthority || 'sama'),
  )
  const [defaultRecipientName, setDefaultRecipientName]     = useState(template?.defaultRecipientName || '')
  const [defaultRecipientOrg, setDefaultRecipientOrg]       = useState(template?.defaultRecipientOrg || '')
  const [defaultRecipientCity, setDefaultRecipientCity]     = useState(template?.defaultRecipientCity || '')
  const [defaultRecipientNameAr, setDefaultRecipientNameAr] = useState(template?.defaultRecipientNameAr || '')
  const [defaultRecipientOrgAr, setDefaultRecipientOrgAr]   = useState(template?.defaultRecipientOrgAr || '')
  const [defaultRecipientCityAr, setDefaultRecipientCityAr] = useState(template?.defaultRecipientCityAr || '')
  const [placeholderDefs, setPlaceholderDefs] = useState<PlaceholderDef[]>(template?.placeholderDefs ?? [])
  // W41: quick-strip pinning + per-template default sub-category.
  const [pinned, setPinned] = useState<boolean>(template?.pinned ?? false)
  const [defaultSubCategory, setDefaultSubCategory] = useState<string>(template?.defaultSubCategory ?? '')
  const subCategoryStore = useFrameworkSubCategoryStore()
  useEffect(() => { void subCategoryStore.fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sigImgRef = useRef<HTMLInputElement>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isCreateMode = template === null

  // L1 fix: track whether the user has manually typed a recipient name so
  // we don't stomp it when they change the target department dropdown.
  const recipientEditedRef = useRef(false)

  const handleDeptChange = (dept: string) => {
    setDefaultSamaDepartment(dept)
    // L1: only auto-fill recipient fields when the user hasn't typed custom values.
    if (!recipientEditedRef.current) {
      const defaults = getRecipientDefaults(defaultAuthority, dept)
      setDefaultRecipientName(defaults.en.name)
      setDefaultRecipientOrg(defaults.en.org)
      setDefaultRecipientCity(defaults.en.city)
      setDefaultRecipientNameAr(defaults.ar.name)
      setDefaultRecipientOrgAr(defaults.ar.org)
      setDefaultRecipientCityAr(defaults.ar.city)
    }
  }

  const handleAuthorityChange = (next: CircularAuthority) => {
    setDefaultAuthority(next)
    // Reset department to that authority's first option and re-derive defaults
    const nextDept = getDefaultDepartmentId(next)
    setDefaultSamaDepartment(nextDept)
    // L1: only auto-fill if the user hasn't manually typed custom recipient values.
    if (!recipientEditedRef.current) {
      const defaults = getRecipientDefaults(next, nextDept)
      setDefaultRecipientName(defaults.en.name)
      setDefaultRecipientOrg(defaults.en.org)
      setDefaultRecipientCity(defaults.en.city)
      setDefaultRecipientNameAr(defaults.ar.name)
      setDefaultRecipientOrgAr(defaults.ar.org)
      setDefaultRecipientCityAr(defaults.ar.city)
    }
  }

  useEffect(() => {
    if (!template?.defaultRecipientName) {
      handleDeptChange(defaultSamaDepartment)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [isUploadingSig, setIsUploadingSig] = useState(false)
  // L3: shown when a signature upload/sign fails OR a stored URL fails to load,
  // so we never leave a broken <img> or an un-saveable data: URL preview.
  const [sigError, setSigError] = useState<string | null>(null)
  // L3: local (data-URL) preview of the just-uploaded file. A freshly-minted
  // Supabase signed URL is briefly un-fetchable (storage clock-skew / object
  // propagation), so loading it immediately renders a BROKEN image — the exact
  // "broken signature on upload" symptom. We persist the durable signed URL in
  // `defaultSignatureImageUrl` (the value saved + validated as https), but PREVIEW
  // the local file, which renders instantly. Empty when editing an existing
  // template (then the preview falls back to the stored URL, which is old + valid).
  const [signaturePreviewSrc, setSignaturePreviewSrc] = useState<string>('')

  // L5: Upload to Supabase storage → get a 1-year signed URL so the
  // default_signature_image_url column stores an https:// URL (the Zod
  // HttpUrl validator rejects base64 data: URIs).
  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setSigError(null)
    setSignaturePreviewSrc('')
    // Validate type + size up front so the user gets a specific, actionable
    // message instead of a generic upload failure after the round-trip.
    if (file.type && !SIGNATURE_ACCEPTED_TYPES.includes(file.type)) {
      setSigError(t('errors.lettersTemplate.signatureWrongType' as Parameters<typeof t>[0]))
      pushToast({ key: 'errors.lettersTemplate.signatureWrongType' }, 'error')
      return
    }
    if (file.size > SIGNATURE_MAX_BYTES) {
      setSigError(t('errors.lettersTemplate.signatureTooLarge' as Parameters<typeof t>[0]))
      pushToast({ key: 'errors.lettersTemplate.signatureTooLarge' }, 'error')
      return
    }
    setIsUploadingSig(true)
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const storagePath = `signatures/${Date.now()}-${safeName}`
      const { error: uploadError } = await supabaseClient.storage
        .from(SIGNATURE_BUCKET)
        .upload(storagePath, file, {
          cacheControl: '31536000',
          upsert: false,
          contentType: file.type || 'image/png',
        })
      if (uploadError) throw uploadError
      // W41: PUBLIC bucket → stable public URL (never expires; renders in the
      // letter view and the PDF without re-minting).
      const { data: publicData } = supabaseClient.storage
        .from(SIGNATURE_BUCKET)
        .getPublicUrl(storagePath)
      if (!publicData?.publicUrl) throw new Error('No public URL')
      // Build the local data-URL preview BEFORE touching state, then set the
      // preview and the saved URL together (one batched render). A just-minted
      // signed URL is briefly un-servable, so if the <img> pointed at it for even
      // one render its onError would fire and imperatively hide it for good.
      // Previewing the local file avoids that; the signed URL is only ever the
      // persisted value (valid by the time the letter is viewed later).
      const previewDataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(new Error('preview read failed'))
        r.readAsDataURL(file)
      })
      setSignaturePreviewSrc(previewDataUrl)
      setDefaultSignatureImageUrl(publicData.publicUrl)
    } catch (err) {
      console.error('[TemplateEditForm] signature upload failed:', err)
      // L3 (code-only): do NOT fall back to a base64 data: URL. The HttpUrl
      // validator rejects data: URIs on save, so the preview looked fine but the
      // signature silently never persisted — and the letter then rendered a
      // broken image. Surface a clear error and keep the field empty instead, so
      // the user knows to retry rather than shipping a letter with no signature.
      setDefaultSignatureImageUrl('')
      // Specific, actionable copy (format + size + retry) — the generic
      // "Signature upload failed" didn't tell the user what to fix.
      setSigError(t('errors.lettersTemplate.signatureUploadFailed' as Parameters<typeof t>[0]))
      // Also surface a dismissible toast so the error is visible even if the
      // inline message is scrolled out of view or the form re-renders.
      pushToast({ key: 'errors.lettersTemplate.signatureUploadFailed' }, 'error')
    } finally {
      setIsUploadingSig(false)
    }
  }

  const handleSubmit = async () => {
    setIsSaving(true)
    try {
      await onSave({
        name,
        type,
        description,
        status,
        icon: selectedIcon,
        color: selectedColor,
        defaultSubjectEn: defaultSubjectEn || undefined,
        defaultSubjectAr: defaultSubjectAr || undefined,
        defaultBodyEn:    defaultBodyEn || undefined,
        defaultBodyAr:    defaultBodyAr || undefined,
        defaultSignerName:     defaultSignerName || undefined,
        defaultSignerTitle:    defaultSignerTitle || undefined,
        defaultSignerNameAr:   defaultSignerNameAr || undefined,
        defaultSignerTitleAr:  defaultSignerTitleAr || undefined,
        defaultSignatureImageUrl: defaultSignatureImageUrl || undefined,
        pinned,
        defaultSubCategory: defaultSubCategory || undefined,
        defaultAuthority,
        defaultSamaDepartment: defaultSamaDepartment as import('@/types').SAMADepartment,
        defaultRecipientName:  defaultRecipientName || undefined,
        defaultRecipientOrg:   defaultRecipientOrg || undefined,
        defaultRecipientCity:  defaultRecipientCity || undefined,
        defaultRecipientNameAr: defaultRecipientNameAr || undefined,
        defaultRecipientOrgAr:  defaultRecipientOrgAr || undefined,
        defaultRecipientCityAr: defaultRecipientCityAr || undefined,
        placeholderDefs: reconcilePlaceholderDefs(placeholderDefs, defaultBodyEn, defaultSubjectEn),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const tabs = [
    { id: 'basic' as const,     label: t('letters.templateTabBasic') },
    { id: 'content' as const,   label: t('letters.templateTabContent') },
    { id: 'signer' as const,    label: t('letters.templateTabSigner') },
    { id: 'recipient' as const, label: t('letters.templateTabRecipient') },
  ]

  return (
    <div className={`p-8 ${isRTL ? 'rtl' : ''}`}>
      <div className={`flex justify-between items-start mb-6`}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            {isCreateMode ? t('letters.createNewTemplate') : t('letters.editTemplate')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isCreateMode ? t('letters.addNewTemplateToDatabank') : `${t('letters.editing')}: ${template?.name}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      {/* Tab Bar */}
      <div className={`flex gap-1 bg-slate-100 p-1 rounded-xl mb-6`}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white shadow-sm text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Basic */}
      {activeTab === 'basic' && (
        <div className="space-y-6">
          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('letters.templateName')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('letters.enterTemplateName')}
              className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none`}
            />
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('letters.letterType')}
            </label>
            {/* BUG-R3-05: bound to useLetterTypeStore so user-added types
                from the Draft modal also surface here (and admins can manage
                types from this surface too). The saved value is the type id
                (e.g. 'inquiry' or a user-added 'internal-memo'), not the label. */}
            <EditableSelect
              value={type || null}
              onChange={(id) => setType(id)}
              items={letterTypeStore.types.map((tt) => ({
                id: tt.id,
                label: tt.label,
                labelAr: tt.labelAr,
                isDefault: tt.isDefault,
              }))}
              placeholder={t('letters.letterType')}
              onAdd={(label, labelAr) => letterTypeStore.add(label, labelAr)}
              onEdit={(id, label, labelAr) =>
                letterTypeStore.update(id, { label, labelAr: labelAr ?? label })
              }
              onDelete={(id) => letterTypeStore.remove(id)}
              isRTL={isRTL}
            />
          </div>

          {/* W41: per-template default sub-category — scoped to the template's
              authority; flows into letters created from this template. */}
          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('letters.subCategory')}
            </label>
            <EditableSelect
              value={defaultSubCategory || null}
              onChange={(id) => setDefaultSubCategory(id)}
              items={subCategoryStore.list(defaultAuthority).map((sc) => ({
                id: sc.id,
                label: sc.label,
                labelAr: sc.labelAr,
                isDefault: sc.isDefault,
              }))}
              placeholder={t('letters.subCategory')}
              onAdd={async (label, labelAr) => {
                const created = await subCategoryStore.add(defaultAuthority, label, labelAr)
                return created.id
              }}
              onEdit={(id, label, labelAr) =>
                subCategoryStore.update(id, { label, labelAr: labelAr ?? label })
              }
              onDelete={(id) => subCategoryStore.remove(id)}
              isRTL={isRTL}
            />
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('common.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('letters.describeTemplatePurpose')}
              rows={3}
              className={`w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none`}
            />
          </div>

          {/* W41: quick-strip pin — pinned templates surface on the letters
              page as one-click starting points. */}
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className={`w-full py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              pinned
                ? 'bg-amber-50 border-2 border-amber-400 text-amber-700'
                : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Icon icon={pinned ? 'lucide:pin' : 'lucide:pin-off'} className="text-sm" />
            {pinned ? t('letters.pinnedToQuickBar') : t('letters.pinToQuickBar')}
          </button>

          <div>
            <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
              {t('common.status')}
            </label>
            <div className={`flex gap-3`}>
              <button
                type="button"
                onClick={() => setStatus('Active')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  status === 'Active'
                    ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {t('common.active')}
              </button>
              <button
                type="button"
                onClick={() => setStatus('Draft')}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  status === 'Draft'
                    ? 'bg-amber-50 border-2 border-amber-500 text-amber-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${status === 'Draft' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                {t('common.draft')}
              </button>
            </div>
          </div>

          {/* L2: Icon + Color picker */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                Icon
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  'lucide:file-text', 'lucide:clipboard-check', 'lucide:shield-question',
                  'lucide:alert-circle', 'lucide:file-warning', 'lucide:mail',
                  'lucide:send', 'lucide:inbox', 'lucide:stamp', 'lucide:book-open',
                  'lucide:scale', 'lucide:building-2', 'lucide:file-check-2',
                  'lucide:file-signature', 'lucide:file-search', 'lucide:scroll-text',
                  'lucide:badge-check', 'lucide:gavel', 'lucide:landmark', 'lucide:briefcase',
                ].map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    title={icon.replace('lucide:', '')}
                    onClick={() => setSelectedIcon(icon)}
                    className={`w-full aspect-square flex items-center justify-center rounded-lg border-2 transition-all cursor-pointer text-base ${
                      selectedIcon === icon
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon icon={icon} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                Color
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { name: 'slate',   hex: '#475569' },
                  { name: 'red',     hex: '#DC2626' },
                  { name: 'orange',  hex: '#EA580C' },
                  { name: 'amber',   hex: '#D97706' },
                  { name: 'yellow',  hex: '#CA8A04' },
                  { name: 'lime',    hex: '#65A30D' },
                  { name: 'green',   hex: '#16A34A' },
                  { name: 'emerald', hex: '#059669' },
                  { name: 'teal',    hex: '#0D9488' },
                  { name: 'cyan',    hex: '#0891B2' },
                  { name: 'sky',     hex: '#0284C7' },
                  { name: 'blue',    hex: '#2563EB' },
                  { name: 'indigo',  hex: '#4F46E5' },
                  { name: 'violet',  hex: '#7C3AED' },
                  { name: 'purple',  hex: '#9333EA' },
                  { name: 'fuchsia', hex: '#C026D3' },
                  { name: 'pink',    hex: '#DB2777' },
                  { name: 'rose',    hex: '#E11D48' },
                ].map(({ name, hex }) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => setSelectedColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={`w-full h-8 rounded-lg border-2 transition-all cursor-pointer ${
                      selectedColor === hex
                        ? 'border-slate-900 scale-110 shadow-md'
                        : 'border-transparent hover:scale-105'
                    }`}
                  />
                ))}
              </div>
              {/* Preview */}
              <div className="mt-3 flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: selectedColor }}
                >
                  <Icon icon={selectedIcon} className="text-sm" />
                </div>
                <span className="text-xs text-slate-600 font-medium truncate">{name || 'Template preview'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Default Content */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl" dir={isRTL ? 'rtl' : 'ltr'}>
            <p className="text-xs font-bold text-blue-900 mb-1">
              <Icon icon="lucide:info" className={`inline-block ${isRTL ? 'ml-1' : 'mr-1'}`} />
              {t('letters.smartPlaceholders.heading' as Parameters<typeof t>[0])}
            </p>
            <p className="text-[11px] text-blue-700">
              {t('letters.smartPlaceholders.body' as Parameters<typeof t>[0])}
            </p>
          </div>

        <div className="grid grid-cols-2 gap-6">
          {/* English column */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">English</h3>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateDefaultSubjectEn')}
              </label>
              <input
                type="text"
                value={defaultSubjectEn}
                onChange={(e) => setDefaultSubjectEn(e.target.value)}
                placeholder="Enter default English subject…"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateDefaultBodyEn')}
              </label>
              <textarea
                value={defaultBodyEn}
                onChange={(e) => setDefaultBodyEn(e.target.value)}
                placeholder="Enter default English body…"
                rows={8}
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              />
            </div>
          </div>
          {/* Arabic column */}
          <div className="space-y-4" dir="rtl">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>العربية</h3>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {t('letters.templateDefaultSubjectAr')}
              </label>
              <input
                type="text"
                value={defaultSubjectAr}
                onChange={(e) => setDefaultSubjectAr(e.target.value)}
                placeholder="أدخل الموضوع الافتراضي…"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                {t('letters.templateDefaultBodyAr')}
              </label>
              <textarea
                value={defaultBodyAr}
                onChange={(e) => setDefaultBodyAr(e.target.value)}
                placeholder="أدخل النص الافتراضي…"
                rows={8}
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
          </div>
        </div>

          <div>
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
              Placeholder definitions
            </h3>
            <PlaceholderDefEditor
              defs={placeholderDefs}
              bodyEn={defaultBodyEn}
              subjectEn={defaultSubjectEn}
              bodyAr={defaultBodyAr}
              subjectAr={defaultSubjectAr}
              onChange={setPlaceholderDefs}
            />
          </div>
        </div>
      )}

      {/* Tab 3: Signer & Signature */}
      {activeTab === 'signer' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateSignerNameEn')}
              </label>
              <input
                type="text"
                value={defaultSignerName}
                onChange={(e) => setDefaultSignerName(e.target.value)}
                placeholder="e.g. Felix Henderson"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateSignerTitleEn')}
              </label>
              <input
                type="text"
                value={defaultSignerTitle}
                onChange={(e) => setDefaultSignerTitle(e.target.value)}
                placeholder="e.g. Head of Compliance"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateSignerNameAr')}
              </label>
              <input
                type="text"
                value={defaultSignerNameAr}
                onChange={(e) => setDefaultSignerNameAr(e.target.value)}
                placeholder="مثال: فيليكس هندرسون"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                dir="rtl"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                {t('letters.templateSignerTitleAr')}
              </label>
              <input
                type="text"
                value={defaultSignerTitleAr}
                onChange={(e) => setDefaultSignerTitleAr(e.target.value)}
                placeholder="مثال: رئيس إدارة الالتزام"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none text-right"
                dir="rtl"
                style={{ fontFamily: "'Amiri', serif" }}
              />
            </div>
          </div>

          {/* Signature Image */}
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-3">
              {t('letters.uploadSignatureImage')}
            </label>
            <input
              ref={sigImgRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleSignatureUpload}
            />
            {isUploadingSig ? (
              <div className="flex items-center justify-center h-28 border-2 border-dashed border-slate-200 rounded-xl">
                <Icon icon="lucide:loader-2" className="animate-spin text-2xl text-emerald-500" />
                <span className="ml-2 text-xs text-slate-500">Uploading…</span>
              </div>
            ) : defaultSignatureImageUrl ? (
              <div className="flex items-center gap-4">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <img
                    src={signaturePreviewSrc || defaultSignatureImageUrl}
                    alt="signature preview"
                    className="h-16 max-w-[180px] object-contain"
                    onError={(ev) => {
                      // L3: never render the browser's broken-image icon — hide it
                      // and surface a load error so the user can re-upload.
                      ev.currentTarget.style.display = 'none'
                      setSigError(t('letters.signatureLoadFailed' as Parameters<typeof t>[0]))
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => sigImgRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Icon icon="lucide:image" />
                    {t('letters.changeSignatureImage')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDefaultSignatureImageUrl(''); setSignaturePreviewSrc(''); setSigError(null) }}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <Icon icon="lucide:x" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => sigImgRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-emerald-300 hover:text-emerald-500 transition-all cursor-pointer gap-2"
              >
                <Icon icon="lucide:image-plus" className="text-2xl" />
                <span className="text-xs font-bold">{t('letters.uploadSignatureImage')}</span>
                <span className="text-[10px]">{t('letters.signatureImageHint')}</span>
              </button>
            )}
            {sigError && (
              <p className="mt-2 text-xs font-bold text-rose-600 flex items-center gap-1">
                <Icon icon="lucide:alert-circle" className="text-sm" />
                {sigError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Recipient */}
      {activeTab === 'recipient' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                {t('letters.authorityField')}
              </label>
              <DynamicAuthoritySelect
                value={defaultAuthority}
                onChange={(v) => handleAuthorityChange(v as CircularAuthority)}
                isRTL={isRTL}
              />
            </div>
            <div>
              <label className={`text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2`}>
                {t('letters.targetDepartment')}
              </label>
              <EditableAuthorityDeptField
                authority={defaultAuthority}
                value={defaultSamaDepartment}
                onChange={handleDeptChange}
                isRTL={isRTL}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">English</h3>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('letters.templateRecipientNameEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientName}
                  onChange={(e) => { recipientEditedRef.current = true; setDefaultRecipientName(e.target.value) }}
                  placeholder="e.g. Banking Supervision Department"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('letters.templateRecipientOrgEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientOrg}
                  onChange={(e) => setDefaultRecipientOrg(e.target.value)}
                  placeholder="e.g. Saudi Central Bank (SAMA)"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
                  {t('letters.templateRecipientCityEn')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientCity}
                  onChange={(e) => setDefaultRecipientCity(e.target.value)}
                  placeholder="e.g. Riyadh, Saudi Arabia"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="space-y-4" dir="rtl">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest" style={{ fontFamily: 'Inter, sans-serif' }}>العربية</h3>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('letters.templateRecipientNameAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientNameAr}
                  onChange={(e) => setDefaultRecipientNameAr(e.target.value)}
                  placeholder="مثال: إدارة الرقابة المصرفية"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('letters.templateRecipientOrgAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientOrgAr}
                  onChange={(e) => setDefaultRecipientOrgAr(e.target.value)}
                  placeholder="مثال: البنك المركزي السعودي (ساما)"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>
                  {t('letters.templateRecipientCityAr')}
                </label>
                <input
                  type="text"
                  value={defaultRecipientCityAr}
                  onChange={(e) => setDefaultRecipientCityAr(e.target.value)}
                  placeholder="مثال: الرياض، المملكة العربية السعودية"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                  style={{ fontFamily: "'Amiri', serif" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSaving || !name.trim()}
          className={`px-8 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer`}
        >
          {isSaving ? (
            <>
              <Icon icon="lucide:loader-2" className="animate-spin" />
              {t('letters.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" />
              {isCreateMode ? t('letters.createTemplate') : t('common.saveChanges')}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
