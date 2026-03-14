'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n'

interface Assignee {
  id?: string
  name: string
  avatar: string
  role?: string
}

interface TransferLeadershipModalProps {
  isOpen: boolean
  onClose: () => void
  onTransfer: (newLeaderId: string, newLeaderName: string) => void
  assignees: Assignee[]
  currentLeaderId?: string
}

export function TransferLeadershipModal({
  isOpen,
  onClose,
  onTransfer,
  assignees,
  currentLeaderId,
}: TransferLeadershipModalProps) {
  const { t, isRTL } = useTranslation()
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')

  const handleTransfer = () => {
    const selectedMember = assignees.find((a) => a.id === selectedMemberId)
    if (selectedMember && selectedMember.id) {
      onTransfer(selectedMember.id, selectedMember.name)
      setSelectedMemberId('')
    }
  }

  const handleClose = () => {
    setSelectedMemberId('')
    onClose()
  }

  // Filter out the current leader from the list
  const availableMembers = assignees.filter((a) => a.id && a.id !== currentLeaderId)

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm">
      <div className="p-6">
        <div className={`flex items-center gap-3 mb-6`}>
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Icon icon="lucide:arrow-right-left" className="text-emerald-600 text-xl" />
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <h2 className="text-lg font-bold text-slate-900">
              {t('observations.detail.transferLeadership')}
            </h2>
            <p className="text-sm text-slate-500">
              {t('observations.detail.transferLeadershipDescription')}
            </p>
          </div>
        </div>

        {availableMembers.length > 0 ? (
          <>
            <div className="space-y-2 mb-6">
              {availableMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setSelectedMemberId(member.id || '')}
                  className={`w-full p-3 border rounded-xl flex items-center gap-3 transition-all ${
                    selectedMemberId === member.id
                      ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500'
                      : 'border-slate-200 hover:border-emerald-300 hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                    className="w-10 h-10 rounded-full"
                    alt={member.name}
                  />
                  <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                    <p className="font-semibold text-slate-900">{member.name}</p>
                    {member.role && (
                      <p className="text-xs text-slate-500">{member.role}</p>
                    )}
                  </div>
                  {selectedMemberId === member.id && (
                    <Icon icon="lucide:check-circle-2" className="text-emerald-500 text-xl" />
                  )}
                </button>
              ))}
            </div>

            <div className={`flex gap-3`}>
              <Button variant="ghost" onClick={handleClose} className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleTransfer}
                disabled={!selectedMemberId}
                className="flex-1"
              >
                {t('observations.detail.transferLeadership')}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Icon icon="lucide:users" className="text-4xl text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {t('observations.detail.noTeamMembersToTransfer')}
            </p>
            <Button variant="ghost" onClick={handleClose} className="mt-4">
              {t('common.close')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
