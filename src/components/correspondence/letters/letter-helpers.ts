import type { SAMALetterType, CircularAuthority } from '@/types'
import {
  getAuthorityRecipientDefaults,
  getDepartmentLabel,
} from '@/lib/letter-authority'

// Sort types
export type LetterSortCol = 'authority' | 'reference' | 'type' | 'subject' | 'status' | 'updatedAt'
export type LetterSortState = { col: LetterSortCol; dir: 'asc' | 'desc' } | null

// Email subject templates per letter type and language (authority-agnostic).
// Falls back to the generic 'notification' entry for custom types added via
// useSAMALetterTypeStore.
export const LETTER_EMAIL_SUBJECTS: Record<string, { en: string; ar: string }> = {
  'non-objection': { en: 'Non-Objection Request',    ar: 'طلب عدم ممانعة' },
  'inquiry':       { en: 'Regulatory Inquiry',        ar: 'استفسار تنظيمي' },
  'submission':    { en: 'Regulatory Submission',     ar: 'تقديم تنظيمي' },
  'notification':  { en: 'Regulatory Notification',  ar: 'إخطار تنظيمي' },
}

export const getEmailSubjectFor = (type: SAMALetterType, lang: 'en' | 'ar'): string => {
  return (LETTER_EMAIL_SUBJECTS[type] ?? LETTER_EMAIL_SUBJECTS['notification'])[lang]
}

export function buildLetterEmailBody(type: SAMALetterType, lang: 'en' | 'ar', reference: string, subject: string): string {
  if (lang === 'ar') {
    const intros: Record<string, string> = {
      'non-objection': `السادة الكرام،\n\nأتقدم بموجب هذا الخطاب بطلب عدم ممانعة بالرجوع إلى المرجع ${reference} بشأن: ${subject}. نرفق طيه الوثائق الداعمة للدراسة والاعتماد. ونبقى رهن الإشارة لتزويدكم بأي معلومات إضافية.`,
      'inquiry':       `السادة الكرام،\n\nيسعدنا التواصل معكم بخصوص استفسارنا التنظيمي تحت مرجع ${reference} المتعلق بـ: ${subject}. نأمل تزويدنا بتوضيحاتكم في هذا الشأن. شاكرين تعاونكم المعتاد.`,
      'submission':    `السادة الكرام،\n\nنتشرف بتقديم المستندات المطلوبة وفق المرجع ${reference} المتعلقة بـ: ${subject}. تجدون مرفقاً الملف المعدّ وفق المتطلبات التنظيمية المعمول بها. نحن بانتظار تأكيد استلامكم.`,
      'notification':  `السادة الكرام،\n\nنودّ إحاطتكم بموجب هذا الإخطار تحت مرجع ${reference} بشأن: ${subject}. نتيح لكم كافة التفاصيل والوثائق الداعمة لاتخاذ الإجراءات اللازمة. نحن في انتظار توجيهاتكم.`,
    }
    return intros[type] ?? intros['notification']
  }
  const intros: Record<string, string> = {
    'non-objection': `Dear Sir/Madam,\n\nWe are writing to formally request a non-objection under reference ${reference} regarding: ${subject}. Please find attached the supporting documentation for your review and approval. We remain at your disposal for any further information required.`,
    'inquiry':       `Dear Sir/Madam,\n\nWe respectfully submit our regulatory inquiry under reference ${reference} concerning: ${subject}. We kindly request your guidance and clarification on this matter. Thank you for your continued support.`,
    'submission':    `Dear Sir/Madam,\n\nPlease find enclosed our regulatory submission under reference ${reference} pertaining to: ${subject}. All required documentation has been prepared in accordance with applicable regulatory requirements. We look forward to your confirmation of receipt.`,
    'notification':  `Dear Sir/Madam,\n\nWe are providing formal notification under reference ${reference} regarding: ${subject}. Full details and supporting documentation are attached for your records. Please advise if any further action is required on our part.`,
  }
  return intros[type] ?? intros['notification']
}

// Recipient defaults derived from authority + department (see src/lib/letter-authority.ts).
export function getRecipientDefaults(
  authority: CircularAuthority,
  deptId: string,
): { en: { name: string; org: string; city: string }; ar: { name: string; org: string; city: string } } {
  const auth = getAuthorityRecipientDefaults(authority) ?? {
    en: { org: authority ?? '', city: '' },
    ar: { org: authority ?? '', city: '' },
  }
  return {
    en: { name: getDepartmentLabel(authority, deptId, 'en'), org: auth.en.org, city: auth.en.city },
    ar: { name: getDepartmentLabel(authority, deptId, 'ar'), org: auth.ar.org, city: auth.ar.city },
  }
}

// Helper to get display templates for the dashboard cards
export const templateTypeCards: Array<{
  type: SAMALetterType
  icon: string
  color: string
  description: string
}> = [
  {
    type: 'non-objection' as SAMALetterType,
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
  },
  {
    type: 'inquiry' as SAMALetterType,
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
  },
  {
    type: 'submission' as SAMALetterType,
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
  },
  {
    type: 'notification' as SAMALetterType,
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
  },
]
