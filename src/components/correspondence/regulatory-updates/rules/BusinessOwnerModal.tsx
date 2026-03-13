'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useCircularStore } from '@/stores/circular-store'
import type { Circular } from '@/types'
import { useDepartmentStore } from '@/stores/department-store'

type Props = {
  isOpen: boolean
  onClose: () => void
  circular: Circular | null
  onAssigned: (toastMsg: string) => void
  t: (key: any, params?: Record<string, string>) => string
}

export function BusinessOwnerModal({ isOpen, onClose, circular, onAssigned, t }: Props) {
  const { assignBusinessOwner, addTimelineEvent } = useCircularStore()
  const { departments: allDepartments } = useDepartmentStore()
  const [boDept, setBoDept] = useState(circular?.businessOwnerDepartment ?? '')

  // Sync dept selection when modal opens or circular changes
  useEffect(() => {
    if (isOpen) setBoDept(circular?.businessOwnerDepartment ?? '')
  }, [isOpen, circular])

  function handleAssign() {
    if (!circular || !boDept) return
    assignBusinessOwner(circular.id, boDept)
    addTimelineEvent(circular.id, {
      title: `Business Owner assigned: ${boDept}`,
      titleAr: `تم تعيين المالك التنفيذي: ${boDept}`,
      date: new Date().toISOString().slice(0, 10),
      user: 'Current User',
      status: 'completed',
    })
    onAssigned(t('regulatoryUpdates.boAssigned'))
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={circular?.businessOwnerDepartment
        ? t('regulatoryUpdates.changeBusinessOwner')
        : t('regulatoryUpdates.assignBusinessOwner')}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('regulatoryUpdates.businessOwnerDept')}</label>
          <select
            className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
            value={boDept}
            onChange={(e) => setBoDept(e.target.value)}
          >
            <option value="">{t('regulatoryUpdates.selectDepartment')}</option>
            {allDepartments.map((dept) => <option key={dept.id} value={dept.name}>{dept.name}</option>)}
          </select>
        </div>
        <div className={`flex justify-end gap-3 pt-2`}>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={handleAssign} disabled={!boDept}>
            {circular?.businessOwnerDepartment
              ? t('regulatoryUpdates.changeBusinessOwner')
              : t('regulatoryUpdates.assignBusinessOwner')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
