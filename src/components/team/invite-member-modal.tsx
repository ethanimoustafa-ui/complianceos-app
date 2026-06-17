'use client'

import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { EditableSelect } from '@/components/ui/editable-select'
import type { TeamMember } from '@/types'
import { useTranslation } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { pushToast } from '@/stores/toast-store'

const inviteSchema = z.object({
  // Validation messages carry i18n keys (resolved to copy via t() at render).
  email: z.string().email('errors.cal.inviteEmailInvalid'),
  role: z.enum(['auditor', 'officer', 'manager', 'admin']),
  department: z.string().min(1, 'errors.cal.inviteDepartmentRequired'),
  message: z.string().optional(),
})

type InviteFormData = z.infer<typeof inviteSchema>

interface InviteMemberModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (member: TeamMember) => void
}

const roles = [
  { id: 'auditor', label: 'Auditor', description: 'View, comment, and observation access' },
  { id: 'officer', label: 'Officer', description: 'Create, edit, comment, and export' },
  { id: 'manager', label: 'Manager', description: 'Admin-level access; receives escalations' },
  { id: 'admin', label: 'Administrator', description: 'Full access including settings and team' },
] as const

export function InviteMemberModal({ isOpen, onClose, onSuccess }: InviteMemberModalProps) {
  const { invite, isMutating } = useTeamStore()
  const { departments: deptList, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()
  const { t } = useTranslation()

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      role: 'officer',
      department: '',
      message: '',
    },
  })

  const onSubmit = async (data: InviteFormData) => {
    try {
      const newMember = await invite({
        email: data.email,
        role: data.role,
        department: data.department,
      })
      onSuccess?.(newMember)
      handleClose()
    } catch (error) {
      console.error('Failed to invite member:', error)
      // Surface the failure so the user knows the invite didn't go through and
      // can retry. The modal stays open (we only close on success).
      pushToast({ key: 'errors.cal.inviteFailed', params: { email: data.email } }, 'error')
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h2 className="text-2xl font-bold font-display text-slate-900">Invite Team Member</h2>
              <p className="text-sm text-slate-500">
                Send an invitation to join your compliance team.
              </p>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Email Address
              </label>
              <div className="relative">
                <Icon
                  icon="lucide:mail"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      placeholder="colleague@company.com"
                      className={cn(
                        'w-full pl-10 pr-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.email ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
              </div>
              {errors.email && (
                <p className="text-rose-500 text-xs mt-1">{t(errors.email.message as TranslationKey)}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4 block">
                Role
              </label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-3">
                    {roles.map((role) => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => field.onChange(role.id)}
                        className={cn(
                          'p-4 border-2 rounded-xl text-left transition-all cursor-pointer',
                          field.value === role.id
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 hover:border-emerald-400'
                        )}
                      >
                        <p className="text-sm font-bold text-slate-900">{role.label}</p>
                        <p className="text-xs text-slate-500 mt-1">{role.description}</p>
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Department
              </label>
              <Controller
                name="department"
                control={control}
                render={({ field }) => (
                  <EditableSelect
                    value={deptList.find((d) => d.name === field.value)?.id ?? null}
                    onChange={(id) => {
                      const dept = deptList.find((d) => d.id === id)
                      field.onChange(dept ? dept.name : '')
                    }}
                    items={deptList.map((d) => ({ id: d.id, label: d.name, labelAr: d.nameAr, isDefault: d.isDefault }))}
                    placeholder={t('observations.form.selectDepartment' as import('@/i18n').TranslationKey)}
                    onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).then(d => d.id)}
                    onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                    onDelete={(id) => removeDepartment(id)}
                  />
                )}
              />
              {errors.department && (
                <p className="text-rose-500 text-xs mt-1">{t(errors.department.message as TranslationKey)}</p>
              )}
            </div>

            <div>
              <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                Personal Message (optional)
              </label>
              <Controller
                name="message"
                control={control}
                render={({ field }) => (
                  <textarea
                    {...field}
                    rows={3}
                    placeholder="Add a personal note to the invitation..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                )}
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex flex-col gap-2">
          {(() => {
            const values = watch()
            const missing: string[] = []
            if (!values.email?.trim()) missing.push('Email Address')
            if (!values.department?.trim()) missing.push('Department')
            return missing.length > 0 ? (
              <p className="text-xs text-rose-600 self-end">
                Missing required: {missing.join(', ')}
              </p>
            ) : null
          })()}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={handleClose} disabled={isMutating}>
              Cancel
            </Button>
            <LoadingButton
              variant="primary"
              loading={isMutating}
              onClick={handleSubmit(onSubmit)}
            >
              <Icon icon="lucide:send" />
              Send Invitation
            </LoadingButton>
          </div>
        </div>
      </div>
    </Modal>
  )
}
