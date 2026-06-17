// Bilingual (en/ar) copy for escalation notifications. Rendered server-side in
// each recipient's preferred language because notifications are persisted as
// plain text (unlike the client-rendered dashboard alerts).

import type { Rung } from './rungs'

export type EscalationLocale = 'en' | 'ar'
export type EscalationSource =
  | 'observation'
  | 'risk'
  | 'audit'
  | 'circular'
  | 'article'
  | 'policy'

// Domain noun per source so the copy reads naturally per area.
const SOURCE_NOUN: Record<EscalationSource, { en: string; ar: string }> = {
  observation: { en: 'observation item', ar: 'بند ملاحظة' },
  risk: { en: 'risk mitigation item', ar: 'بند معالجة مخاطر' },
  audit: { en: 'audit task', ar: 'مهمة تدقيق' },
  circular: { en: 'circular step', ar: 'خطوة تعميم' },
  article: { en: 'article requirement', ar: 'متطلب مادة' },
  policy: { en: 'policy step', ar: 'خطوة سياسة' },
}

export interface RenderedNotification {
  title: string
  message: string
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function renderEscalationNotification(
  locale: EscalationLocale,
  source: EscalationSource,
  rung: Rung,
  opts: { name: string; daysOut: number },
): RenderedNotification {
  const noun = SOURCE_NOUN[source][locale]
  const n = Math.abs(opts.daysOut)

  if (locale === 'ar') {
    if (rung === 'overdue') {
      return {
        title: 'تصعيد بند متأخر',
        message: `${noun} «${opts.name}» متأخر بمقدار ${n} يوم وتم تصعيده إلى المدير.`,
      }
    }
    return {
      title: 'تذكير بموعد نهائي',
      message: n === 0
        ? `${noun} «${opts.name}» مستحق اليوم.`
        : `${noun} «${opts.name}» مستحق خلال ${n} يوم.`,
    }
  }

  // en
  const s = n === 1 ? '' : 's'
  if (rung === 'overdue') {
    return {
      title: 'Overdue item escalated',
      message: `${cap(noun)} “${opts.name}” is ${n} day${s} overdue and has been escalated to the manager.`,
    }
  }
  return {
    title: 'Deadline reminder',
    message: n === 0
      ? `${cap(noun)} “${opts.name}” is due today.`
      : `${cap(noun)} “${opts.name}” is due in ${n} day${s}.`,
  }
}
