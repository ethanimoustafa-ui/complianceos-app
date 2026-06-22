// Central category-config helper. Replaces (or wraps) per-page color/label maps
// for `PolicyCategory`, `TrainingCategory`, `AuditCategory`, `RiskCategory`.
//
// All four category types have been widened to `string` in `src/types/index.ts`
// so persisted records may carry user-added ids the renderer has never seen.
// `getCategoryConfig(kind, id)` always returns a renderable shape: known seeds
// keep their original palette, unknown ids fall back to a neutral slate look.

export type CategoryKind = 'policy' | 'training' | 'audit' | 'risk'

export interface CategoryColor {
  dot: string
  bg: string
  text: string
  border: string
  // Optional pill class (combination of bg + text already pre-mixed) — not all
  // call sites need this, but it matches what `riskCategoryConfig` exposed.
  pill?: string
  icon?: string
}

export interface CategoryConfig extends CategoryColor {
  label: string
  labelAr: string
}

export const fallbackColor: CategoryColor = {
  dot: 'bg-slate-400',
  bg: 'bg-slate-50',
  text: 'text-slate-600',
  border: 'border-slate-200',
  pill: 'bg-slate-100 text-slate-700',
  icon: 'lucide:tag',
}

// Named color tokens for user-chosen category colors (Settings picker). The
// stored `color` is one of these keys; the picker renders a swatch per token and
// the display maps the token → these Tailwind class sets. Keep keys in sync with
// the picker in the settings UI.
export const CATEGORY_COLOR_TOKENS: Record<string, CategoryColor> = {
  blue:    { dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    pill: 'bg-blue-100 text-blue-700' },
  emerald: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700' },
  purple:  { dot: 'bg-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  pill: 'bg-purple-100 text-purple-700' },
  amber:   { dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700' },
  rose:    { dot: 'bg-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    pill: 'bg-rose-100 text-rose-700' },
  cyan:    { dot: 'bg-cyan-500',    bg: 'bg-cyan-50',    text: 'text-cyan-700',    border: 'border-cyan-200',    pill: 'bg-cyan-100 text-cyan-700' },
  indigo:  { dot: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  pill: 'bg-indigo-100 text-indigo-700' },
  teal:    { dot: 'bg-teal-500',    bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    pill: 'bg-teal-100 text-teal-700' },
  orange:  { dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200',  pill: 'bg-orange-100 text-orange-700' },
  pink:    { dot: 'bg-pink-500',    bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',    pill: 'bg-pink-100 text-pink-700' },
}

export const CATEGORY_COLOR_TOKEN_KEYS = Object.keys(CATEGORY_COLOR_TOKENS)

// ── Built-in seed palettes ───────────────────────────────────────────────────

const POLICY: Record<string, CategoryConfig> = {
  compliance: { label: 'Compliance', labelAr: 'الامتثال',     icon: 'lucide:shield',         dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    pill: 'bg-blue-100 text-blue-700' },
  it:         { label: 'IT',         labelAr: 'تقنية المعلومات', icon: 'lucide:server',     dot: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200',  pill: 'bg-indigo-100 text-indigo-700' },
  operations: { label: 'Operations', labelAr: 'العمليات',       icon: 'lucide:settings',    dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700' },
  risk:       { label: 'Risk',       labelAr: 'المخاطر',         icon: 'lucide:alert-triangle', dot: 'bg-rose-500', bg: 'bg-rose-50',  text: 'text-rose-700',    border: 'border-rose-200',    pill: 'bg-rose-100 text-rose-700' },
  hr:         { label: 'HR',         labelAr: 'الموارد البشرية',  icon: 'lucide:users',       dot: 'bg-pink-500',    bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200',    pill: 'bg-pink-100 text-pink-700' },
  finance:    { label: 'Finance',    labelAr: 'المالية',         icon: 'lucide:dollar-sign', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700' },
}

const TRAINING: Record<string, CategoryConfig> = {
  compliance:            { label: 'Compliance',           labelAr: 'الامتثال',          dot: 'bg-blue-500',    bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-200',    pill: 'bg-blue-100 text-blue-700' },
  aml:                   { label: 'AML',                  labelAr: 'مكافحة غسل الأموال', dot: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700' },
  cybersecurity:         { label: 'Cybersecurity',        labelAr: 'الأمن السيبراني',    dot: 'bg-purple-500',  bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200',  pill: 'bg-purple-100 text-purple-700' },
  sharia:                { label: 'Sharia',               labelAr: 'الشريعة',            dot: 'bg-amber-500',   bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700' },
  risk:                  { label: 'Risk',                 labelAr: 'المخاطر',            dot: 'bg-rose-500',    bg: 'bg-rose-100',    text: 'text-rose-700',    border: 'border-rose-200',    pill: 'bg-rose-100 text-rose-700' },
  'data-privacy':        { label: 'Data Privacy',         labelAr: 'خصوصية البيانات',    dot: 'bg-cyan-500',    bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-200',    pill: 'bg-cyan-100 text-cyan-700' },
  ethics:                { label: 'Ethics',               labelAr: 'الأخلاقيات',         dot: 'bg-indigo-500',  bg: 'bg-indigo-100',  text: 'text-indigo-700',  border: 'border-indigo-200',  pill: 'bg-indigo-100 text-indigo-700' },
  'fraud-prevention':    { label: 'Fraud Prevention',     labelAr: 'منع الاحتيال',       dot: 'bg-orange-500',  bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200',  pill: 'bg-orange-100 text-orange-700' },
  governance:            { label: 'Governance',           labelAr: 'الحوكمة',            dot: 'bg-teal-500',    bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    pill: 'bg-teal-100 text-teal-700' },
  'operational-risk':    { label: 'Operational Risk',     labelAr: 'مخاطر تشغيلية',       dot: 'bg-red-500',     bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     pill: 'bg-red-100 text-red-700' },
  'business-continuity': { label: 'Business Continuity',  labelAr: 'استمرارية الأعمال',  dot: 'bg-lime-500',    bg: 'bg-lime-100',    text: 'text-lime-700',    border: 'border-lime-200',    pill: 'bg-lime-100 text-lime-700' },
  sanctions:             { label: 'Sanctions',            labelAr: 'العقوبات',           dot: 'bg-pink-500',    bg: 'bg-pink-100',    text: 'text-pink-700',    border: 'border-pink-200',    pill: 'bg-pink-100 text-pink-700' },
  'internal-audit':      { label: 'Internal Audit',       labelAr: 'التدقيق الداخلي',    dot: 'bg-violet-500',  bg: 'bg-violet-100',  text: 'text-violet-700',  border: 'border-violet-200',  pill: 'bg-violet-100 text-violet-700' },
}

const AUDIT: Record<string, CategoryConfig> = {
  security_compliance:    { label: 'Security Compliance',     labelAr: 'الامتثال الأمني',      dot: 'bg-indigo-500', bg: 'bg-indigo-50', text: 'text-indigo-600', border: 'border-indigo-200', pill: 'bg-indigo-100 text-indigo-700' },
  financial_compliance:   { label: 'Financial Compliance',    labelAr: 'الامتثال المالي',     dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-600',  border: 'border-green-200',  pill: 'bg-green-100 text-green-700' },
  regulatory_compliance:  { label: 'Regulatory Compliance',   labelAr: 'الامتثال التنظيمي',   dot: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', pill: 'bg-orange-100 text-orange-700' },
  operational_compliance: { label: 'Operational Compliance',  labelAr: 'الامتثال التشغيلي',   dot: 'bg-amber-500',  bg: 'bg-amber-50',  text: 'text-amber-600',  border: 'border-amber-200',  pill: 'bg-amber-100 text-amber-700' },
  hr_compliance:          { label: 'HR Compliance',           labelAr: 'امتثال الموارد البشرية', dot: 'bg-pink-500', bg: 'bg-pink-50', text: 'text-pink-600',   border: 'border-pink-200',   pill: 'bg-pink-100 text-pink-700' },
  sharia_compliance:      { label: 'Sharia Compliance',       labelAr: 'الامتثال الشرعي',     dot: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', pill: 'bg-violet-100 text-violet-700' },
}

const RISK: Record<string, CategoryConfig> = {
  operational:  { label: 'Operational',  labelAr: 'تشغيلية',     icon: 'lucide:settings',        dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',    pill: 'bg-blue-100 text-blue-700' },
  financial:    { label: 'Financial',    labelAr: 'مالية',       icon: 'lucide:dollar-sign',     dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', pill: 'bg-emerald-100 text-emerald-700' },
  compliance:   { label: 'Compliance',   labelAr: 'الامتثال',    icon: 'lucide:shield',          dot: 'bg-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  pill: 'bg-purple-100 text-purple-700' },
  strategic:    { label: 'Strategic',    labelAr: 'استراتيجية',   icon: 'lucide:target',          dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   pill: 'bg-amber-100 text-amber-700' },
  reputational: { label: 'Reputational', labelAr: 'سمعة',         icon: 'lucide:users',           dot: 'bg-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-700',    border: 'border-rose-200',    pill: 'bg-rose-100 text-rose-700' },
}

const REGISTRY: Record<CategoryKind, Record<string, CategoryConfig>> = {
  policy: POLICY,
  training: TRAINING,
  audit: AUDIT,
  risk: RISK,
}

/**
 * Returns a renderable config (label + colors) for a given category id.
 *
 * - Tries the built-in seed palette first.
 * - Falls back to a neutral slate config with the raw id as the label so
 *   user-added ids never crash a renderer.
 * - Pass `overrideLabel` to inject the user-edited EN/AR label from the
 *   matching category store (kept optional so non-store call sites still work).
 */
export function getCategoryConfig(
  kind: CategoryKind,
  id: string | null | undefined,
  override?: { label?: string; labelAr?: string; color?: string; icon?: string },
): CategoryConfig {
  if (!id) {
    return { ...fallbackColor, label: '—', labelAr: '—' }
  }
  const seed = REGISTRY[kind][id]
  // Colors: a stored color token wins, else the seed palette, else slate.
  const tokenColor = override?.color ? CATEGORY_COLOR_TOKENS[override.color] : undefined
  const colors: CategoryColor = tokenColor ?? seed ?? fallbackColor
  return {
    dot: colors.dot,
    bg: colors.bg,
    text: colors.text,
    border: colors.border,
    pill: colors.pill,
    // Icon: a stored icon wins, else the seed icon, else the tag fallback.
    icon: override?.icon ?? seed?.icon ?? fallbackColor.icon,
    label: override?.label ?? seed?.label ?? id,
    labelAr: override?.labelAr ?? override?.label ?? seed?.labelAr ?? id,
  }
}

// Useful when a caller has a list of seed ids it wants to enumerate (e.g.,
// rendering a default seed dropdown).
export function getSeedIds(kind: CategoryKind): string[] {
  return Object.keys(REGISTRY[kind])
}
