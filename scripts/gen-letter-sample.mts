// One-off: build a sample SAMA letter (EN + AR) with a full signature block and
// render it via the LaTeX microservice, so the signature/sign-off can be checked
// visually. Writes letter-en.pdf + letter-ar.pdf to the repo root.
//
//   npx tsx scripts/gen-letter-sample.mts
//
// (The renderer is on Render's free tier — the first request may take ~50s while
// the container cold-starts.)

import { readFileSync, writeFileSync } from 'node:fs'
import { buildSamaLetterTex } from '../src/lib/pdf/latex/render-sama-letter'
import { compileLatex } from '../src/lib/pdf/latex/client'

// Load LATEX_RENDER_URL + LATEX_RENDER_SECRET from .env.local.
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}

const samples = {
  en: {
    reference: 'SAMA-NOB-2026-0001',
    hijriDate: '01 Muharram 1448',
    gregorianDate: '17 June 2026',
    recipientName: 'The Manager, Banking Supervision Department',
    recipientOrg: 'Saudi Central Bank (SAMA)',
    recipientCity: 'Riyadh',
    subject: 'Response to Compliance Observation No. 2026-014',
    body:
      'With reference to your circular dated 10 June 2026 regarding the above-mentioned observation, we confirm that the required corrective actions have been completed within the stipulated timeframe.\n\n' +
      'A detailed remediation report is attached for your review. We remain committed to full compliance with all applicable regulatory requirements and welcome any further guidance.',
    signerName: 'Hani Moustafa',
    signerTitle: 'Chief Compliance Officer',
    attachments: ['Remediation Report 2026-014', 'Supporting Evidence (Annex A)'],
  },
  ar: {
    reference: 'SAMA-NOB-2026-0001',
    hijriDate: '01 محرم 1448',
    gregorianDate: '17 يونيو 2026',
    recipientName: 'مدير إدارة الرقابة على البنوك',
    recipientOrg: 'البنك المركزي السعودي (ساما)',
    recipientCity: 'الرياض',
    subject: 'الرد على ملاحظة الالتزام رقم 2026-014',
    body:
      'بالإشارة إلى تعميمكم المؤرخ في 10 يونيو 2026 بشأن الملاحظة المذكورة أعلاه، نؤكد أنه قد تم استكمال الإجراءات التصحيحية المطلوبة خلال المدة المحددة.\n\n' +
      'مرفق تقرير تفصيلي بالمعالجة لمراجعتكم. ونؤكد التزامنا الكامل بجميع المتطلبات التنظيمية المعمول بها، ونرحب بأي توجيهات إضافية.',
    signerName: 'هاني مصطفى',
    signerTitle: 'رئيس إدارة الالتزام',
    attachments: ['تقرير المعالجة 2026-014', 'المستندات الداعمة (الملحق أ)'],
  },
} as const

for (const locale of ['en', 'ar'] as const) {
  const { tex, assets } = buildSamaLetterTex(samples[locale], locale)
  console.log(`[${locale}] compiling via ${process.env.LATEX_RENDER_URL} …`)
  const pdf = await compileLatex({ tex, assets })
  const out = `letter-${locale}.pdf`
  writeFileSync(out, pdf)
  console.log(`[${locale}] wrote ${out} (${pdf.length.toLocaleString()} bytes)`)
}
