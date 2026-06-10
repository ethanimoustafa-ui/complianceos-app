// Audit checklist tasks — W45: server-backed.
//
// This store was previously `persist`-only (localStorage): the checklist
// never loaded anything on a fresh browser and never wrote anything to the
// server, even though /api/audits/[auditId]/tasks (+ [taskId]) existed.
// Mutations are now optimistic-local with fire-and-forget persistence and a
// resync-from-server rollback on failure. `category`/`categoryColor` remain
// client-side presentation fields (the server schema doesn't model them).

import { create } from 'zustand'
import { api } from '@/lib/api-client'
import { useAuditLogStore } from './audit-log-store'
import { useAuthStore } from './auth-store'
import { useTeamStore } from './team-store'

export interface AuditTask {
  id: string
  auditId: string
  title: string
  description?: string
  category: string // Stores the category key (e.g., 'access-control')
  categoryColor: 'blue' | 'amber' | 'purple'
  assignee: { id: string; name: string; avatar: string }
  dueDate: string
  completed: boolean
  completedAt?: string
  completedBy?: string
  notes?: string
  frameworkIds?: string[]
  severity?: 'critical' | 'high' | 'medium' | 'low'
  createdAt: string
}

interface AuditTaskApiRow {
  id: string
  audit_id: string
  title: string
  description: string | null
  assignee_id: string | null
  status: string | null
  priority: string | null
  due_date: string | null
  completed: boolean | null
  completed_at: string | null
  severity: string | null
  framework_ids: string[] | null
  created_at: string
  updated_at: string
}

const getCurrentUser = () => {
  const user = useAuthStore.getState().user
  return {
    name: user?.name || 'System',
    avatar: user?.avatar || '',
  }
}

function resolveAssignee(assigneeId: string | null): AuditTask['assignee'] {
  const m = assigneeId ? useTeamStore.getState().members.find((x) => x.id === assigneeId) : undefined
  return { id: assigneeId ?? '', name: m?.name ?? '', avatar: m?.avatar ?? '' }
}

function mapTaskRow(row: AuditTaskApiRow, previous?: AuditTask): AuditTask {
  return {
    id: row.id,
    auditId: row.audit_id,
    title: row.title,
    description: row.description ?? undefined,
    // Presentation-only fields survive from the optimistic entry when present.
    category: previous?.category ?? 'general',
    categoryColor: previous?.categoryColor ?? 'blue',
    assignee: previous?.assignee?.name ? previous.assignee : resolveAssignee(row.assignee_id),
    dueDate: row.due_date ?? '',
    completed: row.completed ?? false,
    completedAt: row.completed_at ?? undefined,
    completedBy: previous?.completedBy,
    notes: previous?.notes,
    frameworkIds: row.framework_ids ?? previous?.frameworkIds ?? [],
    severity: (row.severity ?? previous?.severity) as AuditTask['severity'],
    createdAt: row.created_at,
  }
}

function unwrapItems<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[]
  const items = (r as { items?: T[] } | null)?.items
  return Array.isArray(items) ? items : []
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuditTaskState {
  tasks: AuditTask[]
  /** Audits whose checklist has been hydrated from the server. */
  loadedAudits: Record<string, boolean>
  error: string | null

  fetchByAudit: (auditId: string) => Promise<void>
  getTasksByAuditId: (auditId: string) => AuditTask[]
  addTask: (task: Omit<AuditTask, 'id' | 'createdAt' | 'completed'>, auditTitle?: string) => AuditTask
  updateTask: (taskId: string, data: Partial<AuditTask>, auditTitle?: string) => AuditTask | null
  deleteTask: (taskId: string, taskTitle?: string, auditTitle?: string) => void
  toggleTaskCompletion: (taskId: string, completed: boolean, user?: { name: string }, auditTitle?: string) => AuditTask | null
}

export const useAuditTaskStore = create<AuditTaskState>()((set, get) => ({
  tasks: [],
  loadedAudits: {},
  error: null,

  fetchByAudit: async (auditId: string) => {
    try {
      const res = await api.get<unknown>(`/audits/${auditId}/tasks`, { pageSize: '100' })
      const rows = unwrapItems<AuditTaskApiRow>(res)
      set((state) => {
        const previousById = new Map(state.tasks.map((t) => [t.id, t]))
        const serverTasks = rows.map((r) => mapTaskRow(r, previousById.get(r.id)))
        return {
          tasks: [...state.tasks.filter((t) => t.auditId !== auditId), ...serverTasks],
          loadedAudits: { ...state.loadedAudits, [auditId]: true },
        }
      })
    } catch (e) {
      set((state) => ({
        loadedAudits: { ...state.loadedAudits, [auditId]: true },
        error: e instanceof Error ? e.message : 'Failed to load checklist',
      }))
    }
  },

  getTasksByAuditId: (auditId: string) => {
    return get().tasks.filter((t) => t.auditId === auditId)
  },

  addTask: (taskData, auditTitle?: string) => {
    const newTask: AuditTask = {
      ...taskData,
      id: crypto.randomUUID(),
      completed: false,
      createdAt: new Date().toISOString(),
    }

    set((state) => ({ tasks: [...state.tasks, newTask] }))

    // Persist; swap the optimistic id for the server id on success.
    void api
      .post<AuditTaskApiRow>(`/audits/${taskData.auditId}/tasks`, {
        title: taskData.title,
        description: taskData.description || undefined,
        assignee_id: UUID_RE.test(taskData.assignee?.id ?? '') ? taskData.assignee.id : undefined,
        priority: taskData.severity ?? 'medium',
        due_date: taskData.dueDate || undefined,
        severity: taskData.severity ?? undefined,
        framework_ids: taskData.frameworkIds ?? [],
      })
      .then((row) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === newTask.id ? mapTaskRow(row, t) : t)),
        }))
      })
      .catch((e) => {
        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== newTask.id),
          error: e instanceof Error ? e.message : 'Failed to add task',
        }))
      })

    const user = getCurrentUser()
    useAuditLogStore.getState().addLog({
      user,
      action: 'created',
      audit: auditTitle || '',
      auditId: taskData.auditId,
      description: `Created task: ${newTask.title}`,
      descriptionKey: 'auditDetail.activityCreatedTask',
      descriptionParams: { title: newTask.title },
      status: 'completed',
    })

    return newTask
  },

  updateTask: (taskId: string, data: Partial<AuditTask>, auditTitle?: string) => {
    const originalTask = get().tasks.find((t) => t.id === taskId)
    if (!originalTask) return null

    const updatedTask: AuditTask = { ...originalTask, ...data }

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    }))

    void api
      .patch(`/audits/${originalTask.auditId}/tasks/${taskId}`, {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description || null } : {}),
        ...(data.dueDate !== undefined ? { due_date: data.dueDate || null } : {}),
        ...(data.severity !== undefined ? { severity: data.severity ?? null } : {}),
        ...(data.frameworkIds !== undefined ? { framework_ids: data.frameworkIds } : {}),
        ...(data.assignee !== undefined
          ? { assignee_id: UUID_RE.test(data.assignee?.id ?? '') ? data.assignee.id : null }
          : {}),
      })
      .catch((e) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === taskId ? originalTask : t)),
          error: e instanceof Error ? e.message : 'Failed to update task',
        }))
      })

    const user = getCurrentUser()
    useAuditLogStore.getState().addLog({
      user,
      action: 'updated',
      audit: auditTitle || '',
      auditId: originalTask.auditId,
      description: `Updated task: ${updatedTask.title}`,
      descriptionKey: 'auditDetail.activityUpdatedTask',
      descriptionParams: { title: updatedTask.title },
      status: 'completed',
    })

    return updatedTask
  },

  deleteTask: (taskId: string, taskTitle?: string, auditTitle?: string) => {
    const task = get().tasks.find((t) => t.id === taskId)

    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }))

    if (task) {
      void api.delete(`/audits/${task.auditId}/tasks/${taskId}`).catch((e) => {
        set((state) => ({
          tasks: [...state.tasks, task],
          error: e instanceof Error ? e.message : 'Failed to delete task',
        }))
      })

      const user = getCurrentUser()
      useAuditLogStore.getState().addLog({
        user,
        action: 'updated',
        audit: auditTitle || '',
        auditId: task.auditId,
        description: `Deleted task: ${taskTitle || task.title}`,
        descriptionKey: 'auditDetail.activityDeletedTask',
        descriptionParams: { title: taskTitle || task.title },
        status: 'completed',
      })
    }
  },

  toggleTaskCompletion: (taskId: string, completed: boolean, user?: { name: string }, auditTitle?: string) => {
    const originalTask = get().tasks.find((t) => t.id === taskId)
    if (!originalTask) return null

    const updatedTask: AuditTask = {
      ...originalTask,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
      completedBy: completed ? user?.name : undefined,
    }

    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    }))

    void api
      .patch(`/audits/${originalTask.auditId}/tasks/${taskId}`, { completed })
      .catch((e) => {
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === taskId ? originalTask : t)),
          error: e instanceof Error ? e.message : 'Failed to update task',
        }))
      })

    const currentUser = getCurrentUser()
    useAuditLogStore.getState().addLog({
      user: currentUser,
      action: 'updated',
      audit: auditTitle || '',
      auditId: updatedTask.auditId,
      description: completed
        ? `Completed task: ${updatedTask.title}`
        : `Reopened task: ${updatedTask.title}`,
      descriptionKey: completed
        ? 'auditDetail.activityCompletedTask'
        : 'auditDetail.activityReopenedTask',
      descriptionParams: { title: updatedTask.title },
      status: 'completed',
    })

    return updatedTask
  },
}))
