import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useAuditLogStore } from './audit-log-store'
import { useAuthStore } from './auth-store'

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
  createdAt: string
}

// Helper to get current user for logging
const getCurrentUser = () => {
  const user = useAuthStore.getState().user
  return {
    name: user?.name || 'System',
    avatar: user?.avatar || '',
  }
}

interface AuditTaskState {
  tasks: AuditTask[]

  // Actions
  getTasksByAuditId: (auditId: string) => AuditTask[]
  addTask: (task: Omit<AuditTask, 'id' | 'createdAt' | 'completed'>, auditTitle?: string) => AuditTask
  updateTask: (taskId: string, data: Partial<AuditTask>, auditTitle?: string) => AuditTask | null
  deleteTask: (taskId: string, taskTitle?: string, auditTitle?: string) => void
  toggleTaskCompletion: (taskId: string, completed: boolean, user?: { name: string }, auditTitle?: string) => AuditTask | null
}

export const useAuditTaskStore = create<AuditTaskState>()(
  persist(
    (set, get) => ({
      tasks: [],

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

        set((state) => ({
          tasks: [...state.tasks, newTask],
        }))

        // Log the task creation
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
          tasks: state.tasks.map((t) => t.id === taskId ? updatedTask : t),
        }))

        // Log the task update
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

        // Log the task deletion
        if (task) {
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
          tasks: state.tasks.map((t) => t.id === taskId ? updatedTask : t),
        }))

        // Log the completion toggle
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
    }),
    {
      name: 'audit-task-storage',
      partialize: (state) => ({
        tasks: state.tasks,
      }),
    }
  )
)
