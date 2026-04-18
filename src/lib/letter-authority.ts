import type { CircularAuthority } from '@/types'

export type LetterAuthority = CircularAuthority

export const LETTER_AUTHORITIES: LetterAuthority[] = ['SAMA', 'CMA', 'IA', 'ZATCA', 'MISA', 'SAFIU']

export const AUTHORITY_FULL_NAMES: Record<LetterAuthority, { en: string; ar: string }> = {
  SAMA:  { en: 'Saudi Central Bank',                      ar: 'البنك المركزي السعودي' },
  CMA:   { en: 'Capital Market Authority',                ar: 'هيئة السوق المالية' },
  IA:    { en: 'Insurance Authority',                     ar: 'هيئة التأمين' },
  ZATCA: { en: 'Zakat, Tax & Customs Authority',          ar: 'هيئة الزكاة والضريبة والجمارك' },
  MISA:  { en: 'Ministry of Investment',                  ar: 'وزارة الاستثمار' },
  SAFIU: { en: 'Saudi Arabia Financial Intelligence Unit',ar: 'وحدة التحريات المالية السعودية' },
}

export const AUTHORITY_COLORS: Record<LetterAuthority, { bg: string; text: string; border: string; dot: string }> = {
  SAMA:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  CMA:   { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500'    },
  IA:    { bg: 'bg-violet-50',  text: 'text-violet-700',  border: 'border-violet-200',  dot: 'bg-violet-500'  },
  ZATCA: { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
  MISA:  { bg: 'bg-sky-50',     text: 'text-sky-700',     border: 'border-sky-200',     dot: 'bg-sky-500'     },
  SAFIU: { bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    dot: 'bg-rose-500'    },
}

export interface DeptDescriptor {
  id: string
  en: string
  ar: string
  email?: string
}

export const AUTHORITY_DEPARTMENTS: Record<LetterAuthority, DeptDescriptor[]> = {
  SAMA: [
    { id: 'banking-supervision', en: 'Banking Supervision Department', ar: 'إدارة الرقابة المصرفية', email: 'bankingsupervision@sama.gov.sa' },
    { id: 'payment-systems',     en: 'Payment Systems Department',     ar: 'إدارة أنظمة الدفع',     email: 'paymentsystems@sama.gov.sa' },
    { id: 'compliance-aml',      en: 'Compliance Department',          ar: 'إدارة الالتزام',         email: 'correspondence@sama.gov.sa' },
  ],
  CMA: [
    { id: 'cma-licensing',   en: 'Licensing & Authorisation', ar: 'الترخيص والتصاريح',  email: 'licensing@cma.org.sa' },
    { id: 'cma-supervision', en: 'Market Supervision',        ar: 'الإشراف على السوق', email: 'supervision@cma.org.sa' },
    { id: 'cma-disclosure',  en: 'Disclosure & Reporting',    ar: 'الإفصاح والتقارير',  email: 'disclosure@cma.org.sa' },
  ],
  IA: [
    { id: 'ia-licensing',   en: 'Insurance Licensing',   ar: 'تراخيص التأمين',     email: 'licensing@ia.gov.sa' },
    { id: 'ia-supervision', en: 'Insurance Supervision', ar: 'الإشراف التأميني',   email: 'supervision@ia.gov.sa' },
    { id: 'ia-claims',      en: 'Claims & Conduct',      ar: 'المطالبات والسلوك', email: 'claims@ia.gov.sa' },
  ],
  ZATCA: [
    { id: 'zatca-tax',     en: 'Tax Compliance', ar: 'الالتزام الضريبي', email: 'tax@zatca.gov.sa' },
    { id: 'zatca-zakat',   en: 'Zakat Affairs',  ar: 'شؤون الزكاة',     email: 'zakat@zatca.gov.sa' },
    { id: 'zatca-customs', en: 'Customs',        ar: 'الجمارك',          email: 'customs@zatca.gov.sa' },
  ],
  MISA: [
    { id: 'misa-investor',  en: 'Investor Affairs', ar: 'شؤون المستثمرين', email: 'investor@misa.gov.sa' },
    { id: 'misa-licensing', en: 'Licensing',        ar: 'الترخيص',         email: 'licensing@misa.gov.sa' },
  ],
  SAFIU: [
    { id: 'safiu-str',         en: 'STR Reporting',           ar: 'الإبلاغ عن العمليات المشبوهة', email: 'str@safiu.gov.sa' },
    { id: 'safiu-cooperation', en: 'Inter-agency Cooperation', ar: 'التعاون بين الجهات',          email: 'cooperation@safiu.gov.sa' },
  ],
}

export const AUTHORITY_RECIPIENT_DEFAULTS: Record<LetterAuthority, { en: { org: string; city: string }; ar: { org: string; city: string } }> = {
  SAMA:  { en: { org: 'Saudi Central Bank (SAMA)',              city: 'Riyadh, Saudi Arabia' }, ar: { org: 'البنك المركزي السعودي (ساما)',     city: 'الرياض، المملكة العربية السعودية' } },
  CMA:   { en: { org: 'Capital Market Authority (CMA)',         city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة السوق المالية',                city: 'الرياض، المملكة العربية السعودية' } },
  IA:    { en: { org: 'Insurance Authority (IA)',               city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة التأمين',                       city: 'الرياض، المملكة العربية السعودية' } },
  ZATCA: { en: { org: 'Zakat, Tax & Customs Authority (ZATCA)', city: 'Riyadh, Saudi Arabia' }, ar: { org: 'هيئة الزكاة والضريبة والجمارك',     city: 'الرياض، المملكة العربية السعودية' } },
  MISA:  { en: { org: 'Ministry of Investment (MISA)',          city: 'Riyadh, Saudi Arabia' }, ar: { org: 'وزارة الاستثمار',                   city: 'الرياض، المملكة العربية السعودية' } },
  SAFIU: { en: { org: 'Saudi Arabia FIU (SAFIU)',               city: 'Riyadh, Saudi Arabia' }, ar: { org: 'وحدة التحريات المالية السعودية',    city: 'الرياض، المملكة العربية السعودية' } },
}

export function getDepartmentLabel(authority: LetterAuthority, deptId: string | undefined, lang: 'en' | 'ar' = 'en'): string {
  if (!deptId) return ''
  const list = AUTHORITY_DEPARTMENTS[authority] || []
  const found = list.find(d => d.id === deptId)
  if (!found) return deptId
  return lang === 'ar' ? found.ar : found.en
}

export function getDepartmentEmail(authority: LetterAuthority, deptId: string | undefined): string | undefined {
  if (!deptId) return undefined
  const list = AUTHORITY_DEPARTMENTS[authority] || []
  return list.find(d => d.id === deptId)?.email
}

export function getDefaultDepartmentId(authority: LetterAuthority): string {
  return AUTHORITY_DEPARTMENTS[authority]?.[0]?.id ?? ''
}
