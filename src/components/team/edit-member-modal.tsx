'use client'

import { useEffect } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { useTeamStore } from '@/stores/team-store'
import { useDepartmentStore } from '@/stores/department-store'
import { EditableSelect } from '@/components/ui/editable-select'
import type { TeamMember } from '@/types'

const memberSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['officer', 'manager', 'admin']),
  department: z.string().min(1, 'Department is required'),
  status: z.enum(['active', 'inactive', 'pending']),
})

type MemberFormData = z.infer<typeof memberSchema>

interface EditMemberModalProps {
  isOpen: boolean
  onClose: () => void
  member: TeamMember | null
  onSuccess?: (member: TeamMember) => void
}

export function EditMemberModal({ isOpen, onClose, member, onSuccess }: EditMemberModalProps) {
  const { update, isLoading } = useTeamStore()
  const { departments: deptList, addDepartment, updateDepartment, removeDepartment } = useDepartmentStore()

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'officer',
      department: '',
      status: 'active',
    },
  })

  useEffect(() => {
    if (member) {
      reset({
        name: member.name,
        email: member.email,
        role: member.role,
        department: member.department,
        status: member.status,
      })
    }
  }, [member, reset])

  const onSubmit = async (data: MemberFormData) => {
    if (!member) return

    try {
      const updatedMember = await update(member.id, {
        name: data.name,
        email: data.email,
        role: data.role,
        department: data.department,
        status: data.status,
      })
      onSuccess?.(updatedMember)
      handleClose()
    } catch (error) {
      console.error('Failed to update member:', error)
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  if (!member) return null

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <div className="flex flex-col max-h-[85vh] -m-6">
        <div className="p-8 flex-1 overflow-y-auto hide-scrollbar">
          <div className="flex justify-between items-start mb-8">
            <div className="flex items-center gap-4">
              <img
                src={member.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`}
                alt={member.name}
                className="w-14 h-14 rounded-full"
              />
              <div>
                <h2 className="text-2xl font-bold font-display text-slate-900">Edit Member</h2>
                <p className="text-sm text-slate-500">Update team member details.</p>
              </div>
            </div>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Full Name
                </label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="text"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.name ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.name && (
                  <p className="text-rose-500 text-xs mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Email
                </label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <input
                      {...field}
                      type="email"
                      className={cn(
                        'w-full px-4 py-3 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        errors.email ? 'border-rose-300' : 'border-slate-200'
                      )}
                    />
                  )}
                />
                {errors.email && (
                  <p className="text-rose-500 text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Role
                </label>
                <Controller
                  name="role"
                  control={control}
                  render={({ field }) => (
                    <select
                      {...field}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="officer">Officer (View Only)</option>
                      <option value="manager">Manager (View + Edit)</option>
                      <option value="admin">Administrator (Full Access)</option>
                    </select>
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
                      placeholder="Select department..."
                      onAdd={(label, labelAr) => addDepartment(label, labelAr ?? label).id}
                      onEdit={(id, label, labelAr) => updateDepartment(id, { name: label, nameAr: labelAr ?? label })}
                      onDelete={(id) => removeDepartment(id)}
                    />
                  )}
                />
                {errors.department && (
                  <p className="text-rose-500 text-xs mt-1">{errors.department.message}</p>
                )}
              </div>

              <div className="col-span-2">
                <label className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2 block">
                  Status
                </label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <div className="flex gap-4">
                      {(['active', 'inactive'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => field.onChange(status)}
                          className={cn(
                            'flex-1 p-4 border-2 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer',
                            field.value === status
                              ? status === 'active'
                                ? 'border-emerald-500 bg-emerald-50'
                                : 'border-slate-400 bg-slate-50'
                              : 'border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                            )}
                          />
                          <span className="text-sm font-bold text-slate-900 capitalize">
                            {status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-8 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
          <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Icon icon="lucide:loader-2" className="animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
