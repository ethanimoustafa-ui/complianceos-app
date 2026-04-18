'use client'

import { useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useTranslation } from '@/i18n'
import type { RegulatoryBodyId } from '@/types'

interface Props {
  isOpen: boolean
  onClose: () => void
}

// Curated icon palette for custom frameworks — keeps visual consistency with
// the existing seed frameworks instead of exposing every Lucide icon.
const ICON_CHOICES: { icon: string; color: string }[] = [
  { icon: 'lucide:landmark', color: 'indigo' },
  { icon: 'lucide:shield-check', color: 'blue' },
  { icon: 'lucide:user-check', color: 'amber' },
  { icon: 'lucide:radio-tower', color: 'violet' },
  { icon: 'lucide:server', color: 'rose' },
  { icon: 'lucide:trending-up', color: 'emerald' },
  { icon: 'lucide:receipt', color: 'teal' },
  { icon: 'lucide:building-2', color: 'orange' },
  { icon: 'lucide:search', color: 'slate' },
  { icon: 'lucide:lock', color: 'blue' },
  { icon: 'lucide:gauge', color: 'cyan' },
  { icon: 'lucide:layers', color: 'emerald' },
  { icon: 'lucide:target', color: 'lime' },
  { icon: 'lucide:badge-check', color: 'yellow' },
  { icon: 'lucide:moon', color: 'amber' },
  { icon: 'lucide:cloud-cog', color: 'sky' },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 40)
}

export function AddFrameworkModal({ isOpen, onClose }: Props) {
  const { t, language } = useTranslation()
  const addFramework = useFrameworkConfigStore((s) => s.addFramework)
  const frameworks = useFrameworkConfigStore((s) => s.frameworks)
  const { departments: allDepartments } = useDepartmentStore()

  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [description, setDescription] = useState('')
  const [descriptionAr, setDescriptionAr] = useState('')
  const [selectedIcon, setSelectedIcon] = useState(ICON_CHOICES[0])
  const [correspondenceBased, setCorrespondenceBased] = useState(true)
  const [departments, setDepartments] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const proposedId = useMemo(() => {
    if (!name.trim()) return ''
    const base = slugify(name)
    const collision = frameworks.some((f) => f.id === base)
    return collision ? `${base}-custom` : base
  }, [name, frameworks])

  function reset() {
    setName(''); setNameAr(''); setDescription(''); setDescriptionAr('')
    setSelectedIcon(ICON_CHOICES[0]); setCorrespondenceBased(true)
    setDepartments([]); setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function toggleDept(deptName: string) {
    setDepartments((prev) =>
      prev.includes(deptName) ? prev.filter((d) => d !== deptName) : [...prev, deptName]
    )
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError(t('settings.frameworkNameRequired'))
      return
    }
    if (!proposedId) {
      setError(t('settings.frameworkNameRequired'))
      return
    }
    const created = addFramework({
      id: proposedId as RegulatoryBodyId,
      name: name.trim(),
      nameAr: nameAr.trim() || name.trim(),
      description: description.trim(),
      descriptionAr: descriptionAr.trim() || description.trim(),
      icon: selectedIcon.icon,
      iconColor: selectedIcon.color,
      enabled: true,
      departments,
      threshold: 'standard',
      alertOnNonCompliance: correspondenceBased,
      correspondenceBased,
    })
    if (!created) {
      setError(t('settings.frameworkIdCollision'))
      return
    }
    handleClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('settings.addFramework')}
      subtitle={t('settings.addFrameworkSubtitle')}
      size="2xl"
    >
      <div className="space-y-4">
        {/* Type toggle */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCorrespondenceBased(true)}
            className={`p-4 border rounded-xl text-start transition-all cursor-pointer ${
              correspondenceBased
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500'
                : 'border-slate-200 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon icon="lucide:landmark" className="text-indigo-600" />
              <p className="text-sm font-bold text-slate-900">{t('settings.correspondenceBased')}</p>
            </div>
            <p className="text-xs text-slate-500">{t('settings.correspondenceBasedHelp')}</p>
          </button>
          <button
            type="button"
            onClick={() => setCorrespondenceBased(false)}
            className={`p-4 border rounded-xl text-start transition-all cursor-pointer ${
              !correspondenceBased
                ? 'border-slate-500 bg-slate-50 ring-2 ring-slate-400'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Icon icon="lucide:book-open" className="text-slate-600" />
              <p className="text-sm font-bold text-slate-900">{t('settings.selfAssessment')}</p>
            </div>
            <p className="text-xs text-slate-500">{t('settings.selfAssessmentHelp')}</p>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('settings.nameEnglish')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.frameworkNamePlaceholder')}
          />
          <Input
            label={t('settings.nameArabic')}
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            placeholder={t('settings.frameworkNamePlaceholder')}
            dir="rtl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.descriptionEnglish')}</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.frameworkDescriptionPlaceholder')}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.descriptionArabic')}</label>
          <textarea
            rows={2}
            value={descriptionAr}
            onChange={(e) => setDescriptionAr(e.target.value)}
            placeholder={t('settings.frameworkDescriptionPlaceholder')}
            dir="rtl"
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          />
        </div>

        {/* Icon picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t('settings.frameworkIcon')}</label>
          <div className="grid grid-cols-8 gap-1.5">
            {ICON_CHOICES.map((choice) => {
              const isSelected = choice.icon === selectedIcon.icon && choice.color === selectedIcon.color
              return (
                <button
                  key={`${choice.icon}-${choice.color}`}
                  type="button"
                  onClick={() => setSelectedIcon(choice)}
                  className={`h-14 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 ring-2 ring-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <Icon icon={choice.icon} className={`text-2xl text-${choice.color}-500`} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Department multiselect */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.selectDepartments')}</label>
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
            {allDepartments.map((dept) => (
              <label key={dept.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={departments.includes(dept.name)}
                  onChange={() => toggleDept(dept.name)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">{language === 'ar' ? dept.nameAr : dept.name}</span>
              </label>
            ))}
          </div>
        </div>

        {proposedId && (
          <p className="text-[10px] text-slate-400 font-mono">ID: {proposedId}</p>
        )}
        {error && <p className="text-xs text-rose-500">{error}</p>}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={handleClose}>{t('common.cancel')}</Button>
          <Button variant="primary" className="flex-1" onClick={handleSubmit}>
            {t('settings.createFramework')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
