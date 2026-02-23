'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { useRequirementStore } from '@/stores/requirement-store'
import type { Requirement as RequirementType } from '@/types'

const predefinedDepartments = ['Compliance', 'IT', 'Finance', 'Operations', 'Risk Management', 'HR', 'Legal']

interface AddRequirementModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddRequirementModal({ isOpen, onClose, onSuccess }: AddRequirementModalProps) {
  const { t, isRTL } = useTranslation()

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('correspondence.addNewRequirement' as TranslationKey)}
      subtitle={t('correspondence.createNewEntry' as TranslationKey)}
      size="lg"
    >
      <AddRequirementForm
        t={t}
        isRTL={isRTL}
        onSuccess={() => { onClose(); onSuccess?.() }}
        onClose={onClose}
      />
    </Modal>
  )
}

function AddRequirementForm({
  t,
  isRTL,
  onSuccess,
  onClose,
}: {
  t: (key: TranslationKey) => string
  isRTL: boolean
  onSuccess: () => void
  onClose: () => void
}) {
  const requirementStore = useRequirementStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    affectedDepartment: '',
    releaseDate: '',
    status: '',
    dueDate: '',
    description: '',
    referenceUrl: '',
  })

  const handleSubmit = () => {
    if (!formData.name || !formData.category || !formData.releaseDate || !formData.status) {
      setValidationError(true)
      return
    }

    setValidationError(false)
    setIsSubmitting(true)
    requirementStore.create({
      name: formData.name,
      category: formData.category,
      affectedDepartment: formData.affectedDepartment || undefined,
      releaseDate: formData.releaseDate,
      status: formData.status as RequirementType['status'],
      dueDate: formData.dueDate || formData.releaseDate,
      description: formData.description,
      referenceUrl: formData.referenceUrl || undefined,
      progress: formData.status === 'completed' ? 100 : formData.status === 'pending' ? 0 : 10,
    })
    setIsSubmitting(false)
    onSuccess()
  }

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t('correspondence.requirementName')} *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g., SAMA Circular 44321/2024 - Cybersecurity Framework"
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('correspondence.category')} *
            </label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectCategory')}</option>
              <option value="Cybersecurity">{t('correspondence.cybersecurity')}</option>
              <option value="AML/CTF">{t('correspondence.amlCtf')}</option>
              <option value="Consumer Protection">{t('correspondence.consumerProtection')}</option>
              <option value="Risk Management">{t('correspondence.riskManagement')}</option>
              <option value="Data Protection">{t('correspondence.dataProtection')}</option>
              <option value="Governance">{t('correspondence.governance')}</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('correspondence.releaseDate')} *
            </label>
            <input
              type="date"
              value={formData.releaseDate}
              onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('correspondence.complianceStatus' as TranslationKey)} *
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            >
              <option value="">{t('common.selectStatus')}</option>
              <option value="pending">{t('common.pending')}</option>
              <option value="drafting">{t('correspondence.drafting')}</option>
              <option value="implementing">{t('correspondence.implementing')}</option>
              <option value="completed">{t('common.completed')}</option>
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
              {t('observations.dueDate')}
            </label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
              className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t('correspondence.affectedDepartment' as TranslationKey)}
          </label>
          <select
            value={formData.affectedDepartment}
            onChange={(e) => setFormData(prev => ({ ...prev, affectedDepartment: e.target.value }))}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          >
            <option value="">—</option>
            {predefinedDepartments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t('correspondence.descriptionOptional')}
          </label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('correspondence.addDetailedDescription')}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>

        <div>
          <label className={`text-xs font-bold text-slate-700 uppercase mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t('correspondence.referenceUrl' as TranslationKey)}
          </label>
          <input
            type="url"
            value={formData.referenceUrl}
            onChange={(e) => setFormData(prev => ({ ...prev, referenceUrl: e.target.value }))}
            placeholder={t('correspondence.referenceUrlPlaceholder' as TranslationKey)}
            className={`w-full px-4 py-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
          />
        </div>
      </div>

      {validationError && (
        <div className={`mt-4 bg-rose-50 p-3 rounded-lg border border-rose-200 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:alert-circle" className="text-rose-500 shrink-0" />
          <p className="text-xs font-bold text-rose-700">{t('correspondence.fillRequiredFields')}</p>
        </div>
      )}

      <div className={`mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200 ${isRTL ? 'text-right' : ''}`}>
        <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <Icon icon="lucide:info" className="text-blue-600 text-xl shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900">{t('correspondence.requiredFields')}</p>
            <p className="text-xs text-blue-700 mt-1">{t('correspondence.requiredFieldsNote')}</p>
          </div>
        </div>
      </div>

      <div className={`flex gap-3 mt-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`flex-1 bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer`}
        >
          {isSubmitting ? (
            <>
              <Icon icon="lucide:loader-2" className="text-lg animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            <>
              <Icon icon="lucide:check" className="text-lg" />
              {t('correspondence.addRequirement')}
            </>
          )}
        </button>
        <button
          onClick={onClose}
          className="px-6 bg-slate-100 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-200 transition-colors cursor-pointer"
        >
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}
