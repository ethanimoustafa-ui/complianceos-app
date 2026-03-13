'use client'

import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useFrameworkConfigStore, getDefaultWeights } from '@/stores/framework-config-store'
import { useDepartmentStore } from '@/stores/department-store'
import { useTranslation } from '@/i18n'
import type { RegulatoryBodyId, ComplianceThreshold, FrameworkWeights } from '@/types'

interface Props {
  frameworkId: RegulatoryBodyId
  isOpen: boolean
  onClose: () => void
}

const WEIGHT_KEYS: (keyof FrameworkWeights)[] = ['audits', 'observations', 'letters', 'policies', 'circulars', 'riskPosture', 'training']

const WEIGHT_I18N: Record<keyof FrameworkWeights, string> = {
  audits: 'settings.auditsWeight',
  observations: 'settings.observationsWeight',
  letters: 'settings.lettersWeight',
  policies: 'settings.policiesWeight',
  circulars: 'settings.circularsWeight',
  riskPosture: 'settings.riskPostureWeight',
  training: 'settings.trainingWeight',
}

export function FrameworkConfigModal({ frameworkId, isOpen, onClose }: Props) {
  const { t, language } = useTranslation()
  const { getById, updateConfig, toggleEnabled } = useFrameworkConfigStore()
  const { departments: allDepartments, addDepartment } = useDepartmentStore()
  const framework = getById(frameworkId)

  const [enabled, setEnabled] = useState(framework?.enabled ?? false)
  const [threshold, setThreshold] = useState<ComplianceThreshold>(framework?.threshold ?? 'standard')
  const [customThreshold, setCustomThreshold] = useState(framework?.customThresholdValue ?? 85)
  const [alertOn, setAlertOn] = useState(framework?.alertOnNonCompliance ?? true)
  const [departments, setDepartments] = useState<string[]>(framework?.departments ?? [])
  const [weights, setWeights] = useState<FrameworkWeights>(framework?.weights ?? getDefaultWeights(frameworkId))
  const [deptSearch, setDeptSearch] = useState('')
  const [showNewDept, setShowNewDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptNameAr, setNewDeptNameAr] = useState('')

  useEffect(() => {
    if (framework) {
      setEnabled(framework.enabled)
      setThreshold(framework.threshold)
      setCustomThreshold(framework.customThresholdValue ?? 85)
      setAlertOn(framework.alertOnNonCompliance)
      setDepartments(framework.departments)
      setWeights(framework.weights ?? getDefaultWeights(frameworkId))
    }
  }, [framework, isOpen, frameworkId])

  const weightsTotal = useMemo(() =>
    WEIGHT_KEYS.reduce((sum, k) => sum + (weights[k] ?? 0), 0),
    [weights]
  )

  if (!framework) return null

  const name = language === 'ar' ? framework.nameAr : framework.name
  const description = language === 'ar' ? framework.descriptionAr : framework.description

  const filteredDepts = allDepartments.filter((d) => {
    if (!deptSearch) return true
    const q = deptSearch.toLowerCase()
    return d.name.toLowerCase().includes(q) || d.nameAr.includes(q)
  })

  function toggleDept(deptName: string) {
    setDepartments((prev) =>
      prev.includes(deptName)
        ? prev.filter((d) => d !== deptName)
        : [...prev, deptName]
    )
  }

  function handleCreateDept() {
    if (!newDeptName.trim()) return
    addDepartment(newDeptName.trim(), newDeptNameAr.trim())
    setDepartments((prev) => [...prev, newDeptName.trim()])
    setNewDeptName('')
    setNewDeptNameAr('')
    setShowNewDept(false)
  }

  function updateWeight(key: keyof FrameworkWeights, value: number) {
    setWeights((prev) => ({ ...prev, [key]: value }))
  }

  function resetWeights() {
    setWeights(getDefaultWeights(frameworkId))
  }

  function handleSave() {
    if (!framework) return
    if (framework.enabled !== enabled) toggleEnabled(frameworkId)
    updateConfig(frameworkId, {
      threshold,
      customThresholdValue: threshold === 'custom' ? customThreshold : undefined,
      alertOnNonCompliance: alertOn,
      departments,
      weights,
    })
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('settings.configureFramework')} ${name}`}
      subtitle={t('settings.adjustFrameworkSettings')}
      size="lg"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pe-1">
        <div className="p-4 bg-slate-50 rounded-xl">
          <p className="text-sm text-slate-600">{description}</p>
        </div>

        {/* Enable/Disable */}
        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
          <div>
            <p className="text-sm font-bold text-slate-900">{t('settings.frameworkStatus')}</p>
            <p className="text-xs text-slate-500">{t('settings.enableDisableFramework')}</p>
          </div>
          <button
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${enabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
            onClick={() => setEnabled(!enabled)}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>

        {/* Departments — Multi-select */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.selectDepartments')}</label>
          <input
            type="text"
            value={deptSearch}
            onChange={(e) => setDeptSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full px-3 py-2 mb-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl p-2 space-y-1">
            {filteredDepts.map((dept) => (
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
            {!showNewDept ? (
              <button
                onClick={() => setShowNewDept(true)}
                className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold px-2 py-1.5 hover:bg-emerald-50 rounded-lg w-full cursor-pointer"
              >
                <Icon icon="lucide:plus" className="text-sm" />
                {t('settings.createNewDepartment')}
              </button>
            ) : (
              <div className="p-2 border-t border-slate-100 space-y-2">
                <input
                  value={newDeptName}
                  onChange={(e) => setNewDeptName(e.target.value)}
                  placeholder={t('settings.departmentName')}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                />
                <input
                  value={newDeptNameAr}
                  onChange={(e) => setNewDeptNameAr(e.target.value)}
                  placeholder={t('settings.departmentNameAr')}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
                  dir="rtl"
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowNewDept(false)} className="text-xs py-1">{t('common.cancel')}</Button>
                  <Button variant="primary" onClick={handleCreateDept} className="text-xs py-1">{t('common.add')}</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compliance Threshold */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <label className="block text-sm font-medium text-slate-700">{t('settings.complianceThreshold')}</label>
            <div className="group relative">
              <Icon icon="lucide:info" className="text-slate-400 text-sm cursor-help" />
              <div className="absolute bottom-full start-0 mb-2 hidden group-hover:block w-72 p-3 bg-slate-800 text-white text-xs rounded-xl shadow-lg z-20">
                {t('settings.thresholdTooltip')}
              </div>
            </div>
          </div>
          <select
            value={threshold}
            onChange={(e) => setThreshold(e.target.value as ComplianceThreshold)}
            className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            <option value="strict">{t('settings.strict90')}</option>
            <option value="standard">{t('settings.standard80')}</option>
            <option value="relaxed">{t('settings.relaxed70')}</option>
            <option value="custom">{t('settings.custom')}</option>
          </select>
          {threshold === 'custom' && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('settings.customThreshold')}</label>
              <input
                type="number"
                min={0}
                max={100}
                value={customThreshold}
                onChange={(e) => setCustomThreshold(Number(e.target.value))}
                className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              <span className="text-sm text-slate-500 ms-1">%</span>
            </div>
          )}
        </div>

        {/* Weightage Section */}
        <div className="border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{t('settings.weightage')}</p>
              <p className="text-xs text-slate-500">{t('settings.weightageDescription')}</p>
            </div>
            <button
              onClick={resetWeights}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              {t('settings.resetWeights')}
            </button>
          </div>
          <div className="space-y-3">
            {WEIGHT_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-600 w-28 shrink-0">
                  {t(WEIGHT_I18N[key] as any)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={weights[key]}
                  onChange={(e) => updateWeight(key, Number(e.target.value))}
                  className="flex-1 accent-emerald-500"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[key]}
                  onChange={(e) => updateWeight(key, Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  className="w-14 px-1.5 py-0.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 text-center focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
                <span className="text-xs text-slate-400">%</span>
              </div>
            ))}
          </div>
          <div className={`mt-3 pt-3 border-t border-slate-100 flex items-center justify-between ${weightsTotal !== 100 ? 'text-rose-600' : 'text-emerald-600'}`}>
            <span className="text-xs font-bold">{t('settings.weightageTotal')}</span>
            <span className="text-sm font-black">{weightsTotal}%</span>
          </div>
          {weightsTotal !== 100 && (
            <p className="text-xs text-rose-500 mt-1">{t('settings.totalMustBe100')}</p>
          )}
        </div>

        {/* Alert toggle */}
        <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
          <div>
            <p className="text-sm font-bold text-slate-900">{t('settings.alertOnNonCompliance')}</p>
            <p className="text-xs text-slate-500">{t('settings.alertDescription')}</p>
          </div>
          <button
            className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${alertOn ? 'bg-emerald-500' : 'bg-slate-200'}`}
            onClick={() => setAlertOn(!alertOn)}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${alertOn ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>

        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" className="flex-1" onClick={handleSave}>{t('settings.saveSettings')}</Button>
        </div>
      </div>
    </Modal>
  )
}
