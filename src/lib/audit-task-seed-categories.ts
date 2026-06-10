// W49 — seeded audit-task category sets for the correspondence authorities
// that lacked one (internal / sama / sharia ship translated sets in the
// detail page). Bilingual code map, same precedent as AUTHORITY_FULL_NAMES.

export interface SeedTaskCategory {
  value: string
  en: string
  ar: string
  color: 'blue' | 'amber' | 'purple'
}

export const SEED_TASK_CATEGORIES: Record<string, SeedTaskCategory[]> = {
  cma: [
    { value: 'disclosure-transparency', en: 'Disclosure & Transparency', ar: 'الإفصاح والشفافية', color: 'blue' },
    { value: 'market-conduct', en: 'Market Conduct', ar: 'سلوكيات السوق', color: 'amber' },
    { value: 'corporate-governance', en: 'Corporate Governance', ar: 'حوكمة الشركات', color: 'purple' },
    { value: 'client-asset-protection', en: 'Client Asset Protection', ar: 'حماية أصول العملاء', color: 'blue' },
    { value: 'insider-trading-controls', en: 'Insider Trading Controls', ar: 'ضوابط التداول الداخلي', color: 'amber' },
  ],
  ia: [
    { value: 'policyholder-protection', en: 'Policyholder Protection', ar: 'حماية حملة الوثائق', color: 'blue' },
    { value: 'claims-handling', en: 'Claims Handling', ar: 'معالجة المطالبات', color: 'amber' },
    { value: 'underwriting-controls', en: 'Underwriting Controls', ar: 'ضوابط الاكتتاب', color: 'purple' },
    { value: 'solvency-reserves', en: 'Solvency & Reserves', ar: 'الملاءة والاحتياطيات', color: 'blue' },
    { value: 'distribution-conduct', en: 'Distribution Conduct', ar: 'سلوكيات التوزيع', color: 'amber' },
  ],
  zatca: [
    { value: 'vat-compliance', en: 'VAT Compliance', ar: 'الامتثال لضريبة القيمة المضافة', color: 'blue' },
    { value: 'zakat-filings', en: 'Zakat Filings', ar: 'إقرارات الزكاة', color: 'amber' },
    { value: 'e-invoicing', en: 'E-Invoicing (Fatoora)', ar: 'الفوترة الإلكترونية (فاتورة)', color: 'purple' },
    { value: 'withholding-tax', en: 'Withholding Tax', ar: 'ضريبة الاستقطاع', color: 'blue' },
    { value: 'customs-valuation', en: 'Customs & Valuation', ar: 'الجمارك والتقييم', color: 'amber' },
  ],
  misa: [
    { value: 'licensing-conditions', en: 'Licensing Conditions', ar: 'شروط الترخيص', color: 'blue' },
    { value: 'foreign-investment-rules', en: 'Foreign Investment Rules', ar: 'قواعد الاستثمار الأجنبي', color: 'amber' },
    { value: 'economic-substance', en: 'Economic Substance', ar: 'الجوهر الاقتصادي', color: 'purple' },
    { value: 'reporting-obligations', en: 'Reporting Obligations', ar: 'التزامات الإبلاغ', color: 'blue' },
  ],
  safiu: [
    { value: 'aml-program', en: 'AML Program', ar: 'برنامج مكافحة غسل الأموال', color: 'blue' },
    { value: 'str-reporting', en: 'STR Reporting', ar: 'بلاغات الاشتباه', color: 'amber' },
    { value: 'kyc-cdd', en: 'KYC / CDD', ar: 'اعرف عميلك / العناية الواجبة', color: 'purple' },
    { value: 'sanctions-screening', en: 'Sanctions Screening', ar: 'فحص العقوبات', color: 'blue' },
    { value: 'record-keeping', en: 'Record Keeping', ar: 'حفظ السجلات', color: 'amber' },
  ],
  citc: [
    { value: 'data-localization', en: 'Data Localization', ar: 'توطين البيانات', color: 'blue' },
    { value: 'service-quality', en: 'Service Quality', ar: 'جودة الخدمة', color: 'amber' },
    { value: 'spectrum-licensing', en: 'Spectrum & Licensing', ar: 'الطيف والترخيص', color: 'purple' },
    { value: 'consumer-protection', en: 'Consumer Protection', ar: 'حماية المستهلك', color: 'blue' },
    { value: 'cybersecurity-crc', en: 'Cybersecurity (CRC)', ar: 'الأمن السيبراني', color: 'amber' },
  ],
}
