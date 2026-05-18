// Notifications service-layer helpers.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotFound } from '../errors'

export const NOTIFICATION_COLUMNS =
  'id, user_id, title, message, type, source_type, route, entity_id, dedupe_key, read, created_at'

export async function assertNotificationOwner(
  supabase: SupabaseClient,
  notificationId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id')
    .eq('id', notificationId)
    .maybeSingle<{ id: string; user_id: string }>()
  if (error) throw error
  if (!data || data.user_id !== userId)
    throw NotFound(`Notification ${notificationId} not found`)
}

// --- domain-specific notification emitters ---------------------------------

interface CircularStepNotifyInput {
  circular: { id: string; reference: string; title: string }
  step: {
    id: string
    label: string
    label_ar?: string | null
    notes?: string | null
    assigned_to: string | null
  }
  actor: { id: string; name: string }
}

/**
 * Notify the assignee of a circular workflow step that the step is now their
 * current responsibility. No-ops if there's no assignee or if the assignee is
 * the actor (self-notify suppression). Failures are logged, never thrown —
 * the caller is the mutation path and shouldn't fail on notification errors.
 */
export async function notifyCircularStepAssignee(
  supabase: SupabaseClient,
  { circular, step, actor }: CircularStepNotifyInput,
): Promise<void> {
  try {
    if (!step.assigned_to) return
    if (step.assigned_to === actor.id) return

    const title = `Action required: ${step.label}`
    const message =
      step.notes ??
      `Step "${step.label}" on circular ${circular.reference} is awaiting your action.`

    const { error } = await supabase.from('notifications').insert({
      user_id: step.assigned_to,
      title,
      message,
      type: 'workflow',
      source_type: 'circular',
      entity_id: circular.id,
      route: `/correspondence/regulatory-updates/rules?id=${circular.id}`,
      dedupe_key: `workflow:${circular.id}:${step.id}:current`,
      read: false,
    })
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/services/notifications] notifyCircularStepAssignee failed', {
        error,
        circularId: circular.id,
        stepId: step.id,
      })
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[api/services/notifications] notifyCircularStepAssignee threw', e)
  }
}
