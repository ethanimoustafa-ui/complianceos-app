'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useLetterStore } from '@/stores/letter-store'
import { useLetterTemplateStore } from '@/stores/letter-template-store'
import { useLetterTypeStore } from '@/stores/letter-type-store'
import { useFrameworkSubCategoryStore } from '@/stores/framework-sub-category-store'
import { useAuthStore } from '@/stores/auth-store'
import { EditableSelect } from '@/components/ui/editable-select'
import {
  getAuthorityDepartments,
  getDefaultDepartmentId,
} from '@/lib/letter-authority'
import {
  reconcilePlaceholderDefs,
  placeholderValuesComplete,
  autoPromoteTypedTokens,
} from '@/lib/letter-placeholders'
import type {
  LetterType,
  Attachment,
  LetterTemplate,
  CircularAuthority,
  PlaceholderValue,
} from '@/types'
import { DynamicAuthoritySelect } from './DynamicAuthoritySelect'
import { EditableAuthorityDeptField } from './EditableAuthorityDeptField'
import { LetterBodyEditor } from './LetterBodyEditor'
import { LetterSubjectEditor } from './LetterSubjectEditor'
import { getRecipientDefaults } from './letter-helpers'

// Create Letter Form Component (Bilingual)
export function CreateLetterForm({
  selectedType,
  onTypeChange,
  onClose,
  onSuccess,
  template,
}: {
  selectedType: LetterType
  onTypeChange: (type: LetterType) => void
  onClose: () => void
  onSuccess: () => void
  template?: LetterTemplate
}) {
  const { t, isRTL } = useTranslation()
  const store = useLetterStore()
  const templateStore = useLetterTemplateStore()
  const letterTypeStore = useLetterTypeStore()
  const { user } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [priority, setPriority] = useState<'standard' | 'urgent'>('standard')

  // Resolve a letter type id to a label, falling back to legacy seed translations
  // when the id is one of the four built-ins.
  const getLetterTypeLabel = useCallback((id: string, lang: 'en' | 'ar'): string => {
    const item = letterTypeStore.types.find((tt) => tt.id === id)
    if (lang === 'ar') {
      if (id === 'non-objection') return t('letters.nonObjection')
      if (id === 'inquiry')       return t('letters.inquiry')
      if (id === 'submission')    return t('letters.submission')
      if (id === 'notification')  return t('letters.notification')
      return item?.labelAr || item?.label || id
    }
    if (id === 'non-objection') return t('letters.nonObjection')
    if (id === 'inquiry')       return t('letters.inquiry')
    if (id === 'submission')    return t('letters.submission')
    if (id === 'notification')  return t('letters.notification')
    return item?.label || id
  }, [letterTypeStore.types, t])
  const [subjectEn, setSubjectEn] = useState('')
  const [subjectAr, setSubjectAr] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [bodyAr, setBodyAr] = useState('')
  const [subCategory, setSubCategory] = useState<string>('key-function')
  const subCategoryStore = useFrameworkSubCategoryStore()
  const [authority, setAuthority] = useState<CircularAuthority>(template?.defaultAuthority ?? 'sama')
  const [samaDepartment, setSamaDepartment] = useState<string>(
    template?.defaultSamaDepartment || getDefaultDepartmentId(template?.defaultAuthority ?? 'sama'),
  )
  const createAttachFileRef = useRef<HTMLInputElement>(null)
  const [draftAttachments, setDraftAttachments] = useState<Attachment[]>([])
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, PlaceholderValue | undefined>>({})
  const placeholderDefs = useMemo(
    () => reconcilePlaceholderDefs(template?.placeholderDefs ?? [], bodyEn, subjectEn),
    [template?.placeholderDefs, bodyEn, subjectEn],
  )

  // Template-registry-aware select. The "Use Template" entry path pre-fills
  // `template`; the bare "Draft New Letter" path leaves it null. Either way
  // the user can pick a different template from this select to (re-)apply.
  const allTemplates = templateStore.templates
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(template?.id ?? '')
  // L1: the template the letter is actually being created from — either the
  // in-modal "Choose Template" select or the initial prop. Threaded into the
  // create payload (template_id) so the server increments usage_count.
  const effectiveTemplateId = selectedTemplateId || template?.id || undefined

  // Apply template defaults — shared by both the initial-template prop path
  // and the in-modal template-select path.
  const applyTemplate = useCallback((t: LetterTemplate | undefined) => {
    if (!t) return
    if (t.defaultSubjectEn)  setSubjectEn(t.defaultSubjectEn)
    if (t.defaultSubjectAr)  setSubjectAr(t.defaultSubjectAr)
    if (t.defaultBodyEn)     setBodyEn(t.defaultBodyEn)
    if (t.defaultBodyAr)     setBodyAr(t.defaultBodyAr)
    if (t.defaultAuthority)  setAuthority(t.defaultAuthority)
    if (t.defaultSamaDepartment) setSamaDepartment(t.defaultSamaDepartment)
    // Reset placeholder values — they belong to the previous template.
    setPlaceholderValues({})
  }, [])

  // Templates filtered by the currently-selected letter type so picking
  // "Inquiry" only surfaces inquiry-type templates. Sourced live from
  // useLetterTemplateStore so user-created templates appear here as well.
  // Sorted by lastModified desc to match Template Registry ordering.
  // BUG-R3-04: do NOT gate on `status === 'Active'` — `TemplateEditForm`
  // creates new templates with default status `'Draft'`. Showing every
  // non-archived template surfaces user-created drafts in the picker. The
  // `TemplateStatus` union is `'Active' | 'Draft'` only (no 'Archived'),
  // so we drop the status clause entirely.
  const filteredTemplates = useMemo(
    () =>
      allTemplates
        .filter((t) => t.type === selectedType)
        .slice()
        .sort((a, b) => {
          const da = new Date(a.lastModified).getTime()
          const db = new Date(b.lastModified).getTime()
          return (isNaN(db) ? 0 : db) - (isNaN(da) ? 0 : da)
        }),
    [allTemplates, selectedType],
  )

  // When authority changes, reset department to that authority's first option
  useEffect(() => {
    const validIds = getAuthorityDepartments(authority).map((d) => d.id)
    if (!validIds.includes(samaDepartment)) {
      setSamaDepartment(getDefaultDepartmentId(authority))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority])

  // When authority changes, drop any sub-category that doesn't belong to the
  // new authority. Per round-3 §5 sub-categories are framework-scoped — a
  // SAMA "Key Function Appointment" must not survive a switch to CMA.
  useEffect(() => {
    const valid = subCategoryStore.list(authority).map((sc) => sc.id)
    if (subCategory && !valid.includes(subCategory)) {
      setSubCategory(valid[0] ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority])

  // Pre-populate from template defaults — runs on the original "Use Template"
  // path (template prop changes) only. The in-modal select uses the
  // `applyTemplate` callback directly via onChange.
  useEffect(() => {
    if (!template) return
    applyTemplate(template)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id])

  // Clear the template select if the user switches to a letter type that the
  // currently-selected template doesn't belong to.
  useEffect(() => {
    if (!selectedTemplateId) return
    const tpl = allTemplates.find((t) => t.id === selectedTemplateId)
    if (!tpl || tpl.type !== selectedType) setSelectedTemplateId('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType])

  // Reference is generated server-side on POST /api/letters. The persisted
  // value comes back on `create()`'s response — see `handleSubmit`/`handleSaveDraft`.
  const createdBy = user?.name || 'Current User'

  const handleDraftAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    const newAtts: Attachment[] = Array.from(files).map(f => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type || 'application/octet-stream',
      size: f.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user?.name || 'Unknown',
    }))
    setDraftAttachments(prev => [...prev, ...newAtts])
    e.target.value = ''
  }

  const buildTimelineEvent = (title: string) => ({
    id: crypto.randomUUID(),
    title,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    user: createdBy,
    status: 'completed' as const,
  })

  const letterBaseData = () => {
    // Recipient defaults derived from currently selected authority + department, falling back
    // to template explicit overrides when set.
    const recipientDefaults = getRecipientDefaults(authority, samaDepartment)
    // Drafts keep raw `{{token}}` markers so that reopening the letter for
    // editing renders inline chips. The flat `renderTemplate(...)` substitution
    // happens later when the letter status transitions to `sent`.
    return {
      authority,
      type: selectedType,
      subCategory: subCategory as import('@/types').SAMASubCategory,
      samaDepartment: samaDepartment as import('@/types').SAMADepartment,
      subject: subjectEn || t('letters.draftOfficialCorrespondence'),
      subjectAr: subjectAr || undefined,
      body: bodyEn,
      bodyAr: bodyAr || undefined,
      status: 'draft' as const,
      priority,
      createdBy,
      signerName:           template?.defaultSignerName || undefined,
      signerTitle:          template?.defaultSignerTitle || undefined,
      signerNameAr:         template?.defaultSignerNameAr || undefined,
      signerTitleAr:        template?.defaultSignerTitleAr || undefined,
      signatureImageUrl:    template?.defaultSignatureImageUrl || undefined,
      recipientName:        template?.defaultRecipientName || recipientDefaults.en.name,
      recipientOrg:         template?.defaultRecipientOrg  || recipientDefaults.en.org,
      recipientCity:        template?.defaultRecipientCity || recipientDefaults.en.city,
      recipientNameAr:      template?.defaultRecipientNameAr || recipientDefaults.ar.name,
      recipientOrgAr:       template?.defaultRecipientOrgAr  || recipientDefaults.ar.org,
      recipientCityAr:      template?.defaultRecipientCityAr || recipientDefaults.ar.city,
      approvalChain: [] as import('@/types').LetterApprovalStep[],
      timeline: [buildTimelineEvent(t('letters.letterCreatedDraft'))],
      // L1: server increments the template usage_count when template_id is present.
      templateId: effectiveTemplateId,
      attachments: draftAttachments,
      relatedObservations: [] as string[],
      // Carry the placeholder defs + values forward so the draft editor
      // surface can offer chips and a defs editor on reopen.
      placeholderDefs: autoPromoteTypedTokens(
        `${bodyEn}\n${bodyAr}`,
        `${subjectEn}\n${subjectAr}`,
        placeholderDefs,
      ),
      placeholderValues,
    }
  }

  const [isSavingDraft, setIsSavingDraft] = useState(false)

  const handleSaveDraft = async () => {
    setIsSavingDraft(true)
    try {
      await store.create(letterBaseData())
      if (effectiveTemplateId) await templateStore.incrementUsage(effectiveTemplateId)
      // W25-A1: only call onSuccess on the happy path — avoids the dual-toast
      // (optimistic-success + API-error) that occurred when both branches ran.
      onSuccess()
    } catch (err) {
      console.error('Failed to save letter draft', err)
      // onSuccess is NOT called on error — the form stays open so the user can
      // correct any issues. The store surfaces the error via store.error.
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const newLetter = await store.create(letterBaseData())
      store.submitForApproval(newLetter.id)
      if (effectiveTemplateId) await templateStore.incrementUsage(effectiveTemplateId)
      // W25-A1: only call onSuccess on the happy path.
      onSuccess()
    } catch (err) {
      console.error('Failed to submit letter for approval', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-8">
      <div className={`flex justify-between items-start mb-8`}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">
            {t('letters.draftOfficialCorrespondence')}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {t('letters.referenceAssigned')}:{' '}
            <span className="font-mono font-bold text-emerald-600">
              {t('letters.referenceAutoGenerated')}
            </span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:x" className="text-2xl text-slate-400" />
        </button>
      </div>

      {/* Authority spans full width at the top so both columns below stay balanced (2 rows each) */}
      <div className="mb-6">
        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
          {t('letters.authorityField')}
        </label>
        <DynamicAuthoritySelect
          value={authority}
          onChange={(v) => setAuthority(v as CircularAuthority)}
          isRTL={isRTL}
        />
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('letters.letterType')}
            </label>
            <EditableSelect
              value={selectedType || null}
              onChange={(id) => onTypeChange(id)}
              items={letterTypeStore.types.map((tt) => ({
                id: tt.id,
                label: getLetterTypeLabel(tt.id, 'en'),
                labelAr: getLetterTypeLabel(tt.id, 'ar'),
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
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('letters.chooseTemplate')}
            </label>
            <EditableSelect
              locked
              items={[
                { id: '', label: t('letters.noTemplateBlank') },
                ...filteredTemplates.map((tpl) => ({
                  id: tpl.id,
                  label: tpl.name,
                })),
              ]}
              value={selectedTemplateId}
              onChange={(id) => {
                setSelectedTemplateId(id)
                if (id) {
                  const tpl = allTemplates.find((tt) => tt.id === id)
                  applyTemplate(tpl)
                }
              }}
              placeholder={t('letters.noTemplateBlank')}
              isRTL={isRTL}
            />

            {filteredTemplates.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1">
                {t('letters.noTemplatesForType')}
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('letters.subCategory')}
            </label>
            {/* Authority-aware per round-3 §5: the picker reads sub-categories
                scoped to the currently selected authority/framework. Adds and
                edits are scoped to the same authority so they appear under
                that framework's list in Settings as well. */}
            <EditableSelect
              value={subCategory || null}
              onChange={(id) => setSubCategory(id)}
              items={(authority ? subCategoryStore.list(authority) : []).map((sc) => ({
                id: sc.id,
                label: sc.label,
                labelAr: sc.labelAr,
                isDefault: sc.isDefault,
              }))}
              placeholder={
                authority
                  ? t('letters.subCategory')
                  : t('letters.selectAuthorityFirst')
              }
              onAdd={async (label, labelAr) => {
                if (!authority) return undefined
                try {
                  const created = await subCategoryStore.add(authority, label, labelAr)
                  return created.id
                } catch (err) {
                  console.error('Failed to add sub-category', err)
                  return undefined
                }
              }}
              onEdit={(id, label, labelAr) =>
                subCategoryStore.update(id, { label, labelAr: labelAr ?? label })
              }
              onDelete={(id) => subCategoryStore.remove(id)}
              isRTL={isRTL}
              disabled={!authority}
            />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('letters.targetDepartment')}
            </label>
            <EditableAuthorityDeptField
              authority={authority}
              value={samaDepartment}
              onChange={setSamaDepartment}
              isRTL={isRTL}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
              {t('calendar.priority')}
            </label>
            <div className={`flex gap-2`}>
              <button
                type="button"
                onClick={() => setPriority('standard')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'standard'
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t('calendar.standard')}
              </button>
              <button
                type="button"
                onClick={() => setPriority('urgent')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                  priority === 'urgent'
                    ? 'bg-slate-50 border-2 border-emerald-500 text-emerald-700'
                    : 'bg-slate-50 border-2 border-transparent text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t('calendar.urgent')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder completion banner — surface only how many tokens are still
          unfilled. The chips themselves live inline in the body/subject preview
          rows below. */}
      {placeholderDefs.length > 0 && (() => {
        const completion = placeholderValuesComplete(placeholderDefs, placeholderValues)
        return (
          <div className={cn(
            'mb-4 px-4 py-2 rounded-lg border flex items-center justify-between gap-3',
            completion.complete
              ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
              : 'bg-amber-50/60 border-amber-200 text-amber-800',
          )}>
            <div className="flex items-center gap-2 text-xs font-medium">
              <Icon icon={completion.complete ? 'lucide:check-circle-2' : 'lucide:alert-circle'} />
              <span>
                {completion.complete
                  ? t('letters.placeholdersAllFilled')
                  : t('letters.placeholdersPending').replace('{count}', String(completion.missing.length))}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {t('letters.placeholdersHint')}
            </span>
          </div>
        )
      })()}

      {/* Bilingual Editors */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* English Side */}
        <div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            {t('letters.subjectEnglish')}
          </label>
          <div className="mb-4">
            <LetterSubjectEditor
              value={subjectEn}
              onChange={setSubjectEn}
              placeholderDefs={placeholderDefs}
              placeholderValues={placeholderValues}
              onPlaceholderChange={(key, v) =>
                setPlaceholderValues((prev) => ({ ...prev, [key]: v }))
              }
              dir="ltr"
              placeholder={t('letters.enterEnglishSubject')}
            />
          </div>
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">
            {t('letters.contentEnglish')}
          </label>
          <LetterBodyEditor
            value={bodyEn}
            onChange={setBodyEn}
            placeholderDefs={placeholderDefs}
            placeholderValues={placeholderValues}
            onPlaceholderChange={(key, v) =>
              setPlaceholderValues((prev) => ({ ...prev, [key]: v }))
            }
            rows={6}
            dir="ltr"
            placeholder={t('letters.typeMessageHere')}
          />
        </div>

        {/* Arabic Side */}
        <div>
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {t('letters.subjectArabic')}
          </label>
          <div className="mb-4">
            <LetterSubjectEditor
              value={subjectAr}
              onChange={setSubjectAr}
              placeholderDefs={placeholderDefs}
              placeholderValues={placeholderValues}
              onPlaceholderChange={(key, v) =>
                setPlaceholderValues((prev) => ({ ...prev, [key]: v }))
              }
              dir="rtl"
              fontFamily="'Amiri', serif"
              textSize="text-lg"
              placeholder={t('letters.enterArabicSubject')}
            />
          </div>
          <label
            className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {t('letters.contentArabic')}
          </label>
          <LetterBodyEditor
            value={bodyAr}
            onChange={setBodyAr}
            placeholderDefs={placeholderDefs}
            placeholderValues={placeholderValues}
            onPlaceholderChange={(key, v) =>
              setPlaceholderValues((prev) => ({ ...prev, [key]: v }))
            }
            rows={6}
            dir="rtl"
            fontFamily="'Amiri', serif"
            textSize="text-lg"
            placeholder={t('letters.typeMessageHere')}
          />
        </div>
      </div>

      <div className={`flex justify-between items-center`}>
        <input ref={createAttachFileRef} type="file" multiple className="hidden" onChange={handleDraftAttach} />
        <button onClick={() => createAttachFileRef.current?.click()} className={`flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer`}>
          <Icon icon="lucide:paperclip" />
          {t('letters.manageAttachments')} ({draftAttachments.length})
        </button>
        <div className={`flex gap-3`}>
          <button
            onClick={handleSaveDraft}
            disabled={isSavingDraft || isSubmitting}
            aria-busy={isSavingDraft || undefined}
            className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
          >
            {isSavingDraft && <Icon icon="lucide:loader-2" className="animate-spin" />}
            {t('letters.saveAsDraft')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || isSavingDraft}
            aria-busy={isSubmitting || undefined}
            className={`px-8 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100 disabled:opacity-50 flex items-center gap-2 cursor-pointer`}
          >
            {isSubmitting ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                {t('letters.processing')}
              </>
            ) : (
              t('letters.sendForApproval')
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
