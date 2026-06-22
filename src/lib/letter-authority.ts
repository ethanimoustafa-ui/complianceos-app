import type { CircularAuthority } from '@/types'

export type LetterAuthority = CircularAuthority

// LetterAuthority values are framework ids (lowercase). The maps below key by
// the known seed ids so existing display code keeps working without per-call
// framework-store lookups. Custom frameworks added via settings don't need
// entries here — display code falls back to the framework store (`fw.name`,
// `fw.iconColor`) through `resolveAuthorityLabel` / `resolveAuthorityCode`.

export const LETTER_AUTHORITIES: LetterAuthority[] = [
  'sama', 'cma', 'ia', 'zatca', 'misa', 'safiu', 'citc', 'sharia-board',
]

export const AUTHORITY_FULL_NAMES: Record<string, { en: string; ar: string }> = {
  sama:           { en: 'Saudi Central Bank',                      ar: 'البنك المركزي السعودي' },
  cma:            { en: 'Capital Market Authority',                ar: 'هيئة السوق المالية' },
  ia:             { en: 'Insurance Authority',                     ar: 'هيئة التأمين' },
  zatca:          { en: 'Zakat, Tax & Customs Authority',          ar: 'هيئة الزكاة والضريبة والجمارك' },
  misa:           { en: 'Ministry of Investment',                  ar: 'وزارة الاستثمار' },
  safiu:          { en: 'Saudi Arabia Financial Intelligence Unit',ar: 'وحدة التحريات المالية السعودية' },
  citc:           { en: 'Communications, Space & Technology Commission', ar: 'هيئة الاتصالات والفضاء والتقنية' },
  'sharia-board': { en: 'Sharia Board',                             ar: 'الهيئة الشرعية' },
}

export const AUTHORITY_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  sama:           { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  dot: 'bg-indigo-500'  },
  cma:            { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  ia:             { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
  zatca:          { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    dot: 'bg-teal-500'    },
  misa:           { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
  safiu:          { bg: 'bg-slate-100',  text: 'text-slate-700',   border: 'border-slate-200',   dot: 'bg-slate-500'   },
  citc:           { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
  'sharia-board': { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
}

const AUTHORITY_FALLBACK_COLOR = { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' }

// Normalise authority values for lookups — accepts either lowercase framework
// id (current) or legacy uppercase values ('SAMA', 'CMA', ...).
function key(authority: string | undefined): string {
  if (!authority) return ''
  const lower = authority.toLowerCase()
  // Legacy 'sharia' → 'sharia-board'
  if (lower === 'sharia') return 'sharia-board'
  return lower
}

// Map an entity's authority / source / audit-type to a canonical framework id
// for per-framework scoring. Returns null for non-framework values ('internal',
// empty) so those items count toward no framework. Used by the scoring
// gather step to associate correspondence by authority, not just framework_ids.
export function toFrameworkId(authority: string | null | undefined): string | null {
  if (!authority) return null
  const lower = authority.toLowerCase()
  if (lower === 'internal' || lower === 'custom' || lower === 'other') return null
  if (lower === 'sharia') return 'sharia-board'
  return lower
}

export function getAuthorityFullName(authority: string | undefined, lang: 'en' | 'ar' = 'en'): string {
  const entry = AUTHORITY_FULL_NAMES[key(authority)]
  if (!entry) return authority ?? ''
  return lang === 'ar' ? entry.ar : entry.en
}

export function getAuthorityColors(authority: string | undefined) {
  return AUTHORITY_COLORS[key(authority)] ?? AUTHORITY_FALLBACK_COLOR
}

export interface DeptDescriptor {
  id: string
  en: string
  ar: string
  email?: string
}

export const AUTHORITY_DEPARTMENTS: Record<string, DeptDescriptor[]> = {
  sama: [
    { id: 'banking-supervision', en: 'Banking Supervision Department', ar: 'إدارة الرقابة المصرفية', email: 'bankingsupervision@sama.gov.sa' },
    { id: 'payment-systems',     en: 'Payment Systems Department',     ar: 'إدارة أنظمة الدفع',     email: 'paymentsystems@sama.gov.sa' },
    { id: 'compliance-aml',      en: 'Compliance Department',          ar: 'إدارة الالتزام',         email: 'correspondence@sama.gov.sa' },
  ],
  cma: [
    { id: 'cma-licensing',   en: 'Licensing & Authorisation', ar: 'الترخيص والتصاريح',  email: 'licensing@cma.org.sa' },
    { id: 'cma-supervision', en: 'Market Supervision',        ar: 'الإشراف على السوق', email: 'supervision@cma.org.sa' },
    { id: 'cma-disclosure',  en: 'Disclosure & Reporting',    ar: 'الإفصاح والتقارير',  email: 'disclosure@cma.org.sa' },
  ],
  ia: [
    { id: 'ia-licensing',   en: 'Insurance Licensing',   ar: 'تراخيص التأمين',     email: 'licensing@ia.gov.sa' },
    { id: 'ia-supervision', en: 'Insurance Supervision', ar: 'الإشراف التأميني',   email: 'supervision@ia.gov.sa' },
    { id: 'ia-claims',      en: 'Claims & Conduct',      ar: 'المطالبات والسلوك', email: 'claims@ia.gov.sa' },
  ],
  zatca: [
    { id: 'zatca-tax',     en: 'Tax Compliance', ar: 'الالتزام الضريبي', email: 'tax@zatca.gov.sa' },
    { id: 'zatca-zakat',   en: 'Zakat Affairs',  ar: 'شؤون الزكاة',     email: 'zakat@zatca.gov.sa' },
    { id: 'zatca-customs', en: 'Customs',        ar: 'الجمارك',          email: 'customs@zatca.gov.sa' },
  ],
  misa: [
    { id: 'misa-investor',  en: 'Investor Affairs', ar: 'شؤون المستثمرين', email: 'investor@misa.gov.sa' },
    { id: 'misa-licensing', en: 'Licensing',        ar: 'الترخيص',         email: 'licensing@misa.gov.sa' },
  ],
  safiu: [
    { id: 'safiu-str',         en: 'STR Reporting',            ar: 'الإبلاغ عن العمليات المشبوهة', email: 'str@safiu.gov.sa' },
    { id: 'safiu-cooperation', en: 'Inter-agency Cooperation', ar: 'التعاون بين الجهات',          email: 'cooperation@safiu.gov.sa' },
  ],
  citc: [
    { id: 'citc-licensing',  en: 'Licensing',          ar: 'الترخيص',           email: 'licensing@citc.gov.sa' },
    { id: 'citc-compliance', en: 'Compliance Affairs', ar: 'شؤون الامتثال',     email: 'compliance@citc.gov.sa' },
  ],
  'sharia-board': [
    { id: 'sharia-review',   en: 'Sharia Review',      ar: 'المراجعة الشرعية',  email: 'review@shariaboard.sa' },
    { id: 'sharia-fatwa',    en: 'Fatwa & Advisory',   ar: 'الفتوى والاستشارة', email: 'fatwa@shariaboard.sa' },
  ],
}

export const AUTHORITY_RECIPIENT_DEFAULTS: Record<string, { en: { org: string; city: string }; ar: { org: string; city: string } }> = {
  sama:           { en: { org: 'Saudi Central Bank (SAMA)',              city: 'Riyadh, Saudi Arabia' }, ar: { org: 'البنك المركزي السعودي (ساما)',     city: 'الرياض، المملكة العربية السعودية' } },
  cma:            { en: { org: 'Capital Market Authority (CMA)',         city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة السوق المالية',                city: 'الرياض، المملكة العربية السعودية' } },
  ia:             { en: { org: 'Insurance Authority (IA)',               city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة التأمين',                       city: 'الرياض، المملكة العربية السعودية' } },
  zatca:          { en: { org: 'Zakat, Tax & Customs Authority (ZATCA)', city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة الزكاة والضريبة والجمارك',     city: 'الرياض، المملكة العربية السعودية' } },
  misa:           { en: { org: 'Ministry of Investment (MISA)',          city: 'Riyadh, Saudi Arabia' }, ar: { org: 'وزارة الاستثمار',                   city: 'الرياض، المملكة العربية السعودية' } },
  safiu:          { en: { org: 'Saudi Arabia FIU (SAFIU)',               city: 'Riyadh, Saudi Arabia' }, ar: { org: 'وحدة التحريات المالية السعودية',    city: 'الرياض، المملكة العربية السعودية' } },
  citc:           { en: { org: 'Communications, Space & Technology Commission (CITC)', city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة الاتصالات والفضاء والتقنية', city: 'الرياض، المملكة العربية السعودية' } },
  'sharia-board': { en: { org: 'Sharia Board',                           city: 'Riyadh, Saudi Arabia' }, ar: { org: 'الهيئة الشرعية',                   city: 'الرياض، المملكة العربية السعودية' } },
}

export function getDepartmentLabel(authority: LetterAuthority, deptId: string | undefined, lang: 'en' | 'ar' = 'en'): string {
  if (!deptId) return ''
  const list = AUTHORITY_DEPARTMENTS[key(authority)] || []
  const found = list.find(d => d.id === deptId)
  // R1: return '' (not deptId) when not found — callers must not leak the
  // raw UUID/id into the UI. The call site provides a fallback label ('—').
  if (!found) return ''
  return lang === 'ar' ? found.ar : found.en
}

export function getDepartmentEmail(authority: LetterAuthority, deptId: string | undefined): string | undefined {
  if (!deptId) return undefined
  const list = AUTHORITY_DEPARTMENTS[key(authority)] || []
  return list.find(d => d.id === deptId)?.email
}

export function getDefaultDepartmentId(authority: LetterAuthority): string {
  return AUTHORITY_DEPARTMENTS[key(authority)]?.[0]?.id ?? ''
}

export function getAuthorityDepartments(authority: LetterAuthority): DeptDescriptor[] {
  return AUTHORITY_DEPARTMENTS[key(authority)] ?? []
}

export function getAuthorityRecipientDefaults(authority: LetterAuthority) {
  return AUTHORITY_RECIPIENT_DEFAULTS[key(authority)]
}
