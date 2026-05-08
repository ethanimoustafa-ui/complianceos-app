import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LetterTemplate, SAMALetterType } from '@/types'
import { requirePermission } from '@/lib/rbac-store-gate'

const typeColors: Record<SAMALetterType, string> = {
  'non-objection': 'emerald',
  inquiry: 'blue',
  submission: 'amber',
  notification: 'rose',
}

const typeIcons: Record<SAMALetterType, string> = {
  'non-objection': 'lucide:user-check',
  inquiry: 'lucide:help-circle',
  submission: 'lucide:file-up',
  notification: 'lucide:alert-triangle',
}

const seedTemplates: LetterTemplate[] = [
  {
    id: 'tmpl-001',
    name: 'Key Function Appointment',
    type: 'non-objection',
    icon: 'lucide:user-check',
    color: 'emerald',
    description: 'Hiring key positions or launching new products.',
    status: 'Active',
    createdDate: 'Jan 15, 2024',
    lastModified: 'Oct 10, 2024',
    usageCount: 45,
    defaultSubjectEn: 'Request for Non-Objection on Appointment of Key Function Holder',
    defaultSubjectAr: 'طلب عدم ممانعة على تعيين شاغل وظيفة رئيسية',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nIn accordance with SAMA\'s regulatory requirements governing the appointment of key function holders, we respectfully submit for your non-objection the appointment of [Candidate Full Name] to the position of [Position Title].\n\nThe candidate has undergone the bank\'s internal fit-and-proper assessment and satisfies the qualifications, experience, and integrity criteria stipulated under the applicable governance framework. Supporting documentation (CV, academic certificates, professional references, and completed fit-and-proper questionnaire) is enclosed with this letter for your review.\n\nWe confirm that the proposed appointment has been approved by the Board Nomination & Remuneration Committee on [Date] and is subject to SAMA\'s non-objection prior to the effective start date.\n\nKindly advise of any additional information required to support your assessment.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nاستناداً إلى المتطلبات التنظيمية الصادرة عن البنك المركزي السعودي بشأن تعيين شاغلي الوظائف الرئيسية، نتشرف بأن نرفع لسعادتكم طلب عدم الممانعة على تعيين [الاسم الكامل للمرشح] في منصب [المسمى الوظيفي].\n\nوقد اجتاز المرشح تقييم الملاءمة والنزاهة الداخلي لدى البنك، ويستوفي معايير المؤهلات والخبرة والنزاهة المقررة بموجب إطار الحوكمة المعمول به. وقد أُرفقت طيه المستندات الداعمة (السيرة الذاتية، الشهادات الأكاديمية، التزكيات المهنية، واستبيان الملاءمة والنزاهة المعبأ) لغرض المراجعة.\n\nنؤكد أن التعيين المقترح قد اعتمدته لجنة الترشيحات والمكافآت المنبثقة عن مجلس الإدارة بتاريخ [التاريخ]، وهو مرهون بعدم ممانعة البنك المركزي قبل تاريخ المباشرة الفعلية.\n\nيرجى إفادتنا بأي معلومات إضافية تلزم لإتمام التقييم.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-002',
    name: 'Product Launch Request',
    type: 'non-objection',
    icon: 'lucide:package',
    color: 'emerald',
    description: 'Request approval for new financial product launches.',
    status: 'Active',
    createdDate: 'Feb 20, 2024',
    lastModified: 'Sep 15, 2024',
    usageCount: 23,
    defaultSubjectEn: 'Request for Non-Objection on New Product Launch',
    defaultSubjectAr: 'طلب عدم ممانعة على إطلاق منتج جديد',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nPursuant to SAMA\'s regulations concerning the introduction of new financial products and services, we hereby submit for your non-objection the launch of [Product Name], a [brief product category description] targeted at [customer segment].\n\nThe product has been developed in line with applicable Shariah governance standards, consumer protection principles, and the bank\'s approved product development framework. A comprehensive product programme — including product features, pricing, target market, risk assessment, AML/CFT considerations, and disclosure documentation — is enclosed for your review.\n\nWe confirm that all required internal approvals (Risk, Compliance, Legal, and the Product Governance Committee) have been obtained. The intended launch date is [Launch Date], subject to SAMA\'s non-objection.\n\nWe remain at your disposal for any clarification or additional information.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nعملاً بتعليمات البنك المركزي السعودي المتعلقة بطرح المنتجات والخدمات المالية الجديدة، نتشرف بأن نرفع لسعادتكم طلب عدم الممانعة على إطلاق منتج [اسم المنتج]، وهو [وصف موجز لفئة المنتج] موجَّه إلى شريحة [الشريحة المستهدفة].\n\nوقد طُوِّر المنتج وفق معايير الحوكمة الشرعية المعمول بها، ومبادئ حماية العملاء، وإطار تطوير المنتجات المعتمد لدى البنك. وقد أرفقنا طيه برنامج المنتج الشامل متضمناً خصائص المنتج، والتسعير، والسوق المستهدفة، وتقييم المخاطر، واعتبارات مكافحة غسل الأموال وتمويل الإرهاب، ووثائق الإفصاح.\n\nنؤكد حصولنا على كافة الموافقات الداخلية اللازمة (إدارة المخاطر، الالتزام، الشؤون القانونية، ولجنة حوكمة المنتجات). ويُقترح أن يكون تاريخ الإطلاق في [تاريخ الإطلاق]، رهيناً بعدم ممانعة البنك المركزي.\n\nنحن تحت تصرفكم لتقديم أي إيضاحات أو معلومات إضافية.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-003',
    name: 'Circular Clarification',
    type: 'inquiry',
    icon: 'lucide:help-circle',
    color: 'blue',
    description: 'Seeking clarification on rules and circulars.',
    status: 'Active',
    createdDate: 'Mar 05, 2024',
    lastModified: 'Aug 22, 2024',
    usageCount: 38,
    defaultSubjectEn: 'Request for Clarification on Circular No. [Circular Reference]',
    defaultSubjectAr: 'طلب إيضاح بشأن التعميم رقم [رقم التعميم]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nWith reference to SAMA Circular No. [Circular Reference] dated [Circular Date] concerning [Subject of Circular], we respectfully seek your kind clarification on the following point(s):\n\n1. [State the specific provision or article in question, quoting the relevant text where helpful.]\n2. [Describe the scenario or interpretive uncertainty, including the practical implication for the bank\'s implementation.]\n\nOur current interpretation is that [summarise the bank\'s interpretation], on the basis of [cite the rationale, related circulars, or guidance]. We would be grateful if SAMA could confirm whether this interpretation is aligned with the regulator\'s intent, or otherwise provide the correct reading.\n\nYour guidance is essential to ensuring consistent and compliant implementation across the bank.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nبالإشارة إلى تعميم البنك المركزي السعودي رقم [رقم التعميم] الصادر بتاريخ [تاريخ التعميم] بشأن [موضوع التعميم]، نتشرف بطلب إيضاح كريم منكم حول النقطة/النقاط التالية:\n\n1. [يُذكر الحكم أو المادة المعنية، مع اقتباس النص ذي الصلة عند الاقتضاء.]\n2. [يُوضَّح السيناريو أو الغموض التفسيري، والأثر العملي على تطبيق البنك.]\n\nتفسيرنا الحالي هو أن [يُلخَّص تفسير البنك]، وذلك استناداً إلى [تُذكر المبررات أو التعاميم أو الإرشادات ذات الصلة]. ونرجو تكرمكم بتأكيد ما إذا كان هذا التفسير متفقاً مع مقصد الجهة التنظيمية، أو تزويدنا بالقراءة الصحيحة.\n\nإن توجيهاتكم أساسية لضمان تطبيق متسق وممتثل على نطاق البنك.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-004',
    name: 'Regulatory Interpretation',
    type: 'inquiry',
    icon: 'lucide:book-open',
    color: 'blue',
    description: 'Request interpretation of specific regulatory requirements.',
    status: 'Draft',
    createdDate: 'Sep 01, 2024',
    lastModified: 'Oct 18, 2024',
    usageCount: 0,
    defaultSubjectEn: 'Request for Regulatory Interpretation — [Topic]',
    defaultSubjectAr: 'طلب تفسير تنظيمي — [الموضوع]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nWe kindly request SAMA\'s formal interpretation of [specific regulatory requirement / article / rule] in the context of the following circumstances:\n\nBackground: [Concise description of the facts, product, process, or business activity giving rise to the question.]\n\nQuestion: [State the interpretive question in a single, focused sentence.]\n\nThe bank\'s preliminary view: [Summarise the bank\'s analysis and the rationale, including any reliance on existing rules, circulars, or international standards.]\n\nImpact of clarification: A confirmed interpretation will enable the bank to [describe the downstream decision or implementation step] in a manner that is fully consistent with SAMA\'s expectations.\n\nWe would be grateful for your formal response at the earliest convenience.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nنتشرف بأن نطلب من البنك المركزي السعودي تفسيراً رسمياً لـ [المتطلب التنظيمي / المادة / القاعدة المحددة] في سياق الظروف التالية:\n\nالخلفية: [وصف موجز للوقائع أو المنتج أو الإجراء أو النشاط التجاري الذي أفضى إلى السؤال.]\n\nالسؤال: [يُذكر السؤال التفسيري في جملة واحدة مركزة.]\n\nالرأي المبدئي للبنك: [يُلخَّص تحليل البنك ومبرراته، بما في ذلك الاعتماد على القواعد أو التعاميم أو المعايير الدولية القائمة.]\n\nأثر التوضيح: إن التفسير المؤكد سيمكّن البنك من [وصف القرار أو خطوة التنفيذ المترتبة] بما يتسق تماماً مع توقعات البنك المركزي.\n\nنتطلع إلى تلقي ردكم الرسمي في أقرب فرصة ممكنة.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-005',
    name: 'Quarterly AML Report',
    type: 'submission',
    icon: 'lucide:file-up',
    color: 'amber',
    description: 'Filing periodic reports and compliance data.',
    status: 'Active',
    createdDate: 'Jan 01, 2024',
    lastModified: 'Oct 01, 2024',
    usageCount: 12,
    defaultSubjectEn: 'Quarterly AML/CFT Compliance Report — [Quarter / Year]',
    defaultSubjectAr: 'التقرير الربعي للالتزام بمكافحة غسل الأموال وتمويل الإرهاب — [الربع / السنة]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nIn accordance with SAMA\'s AML/CFT reporting requirements, please find enclosed the bank\'s Quarterly AML/CFT Compliance Report covering the period from [Start Date] to [End Date].\n\nThe report includes, inter alia:\n  • Summary of suspicious transaction reports (STRs) filed with SAFIU during the quarter;\n  • Customer due diligence (CDD) and enhanced due diligence (EDD) statistics;\n  • Sanctions screening outcomes and any true matches reported;\n  • Training completion rates across first, second, and third lines of defence;\n  • Key AML/CFT issues identified, remediation status, and management actions.\n\nThe report has been reviewed by the MLRO and approved by the Board Audit & Compliance Committee prior to submission. Supporting data tables and annexures are attached.\n\nWe remain available for any further information or clarification SAMA may require.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nوفقاً لمتطلبات البنك المركزي السعودي الخاصة بالتقارير المتعلقة بمكافحة غسل الأموال وتمويل الإرهاب، نرفق طيه التقرير الربعي للالتزام بمكافحة غسل الأموال وتمويل الإرهاب للفترة من [تاريخ البداية] إلى [تاريخ النهاية].\n\nيتضمن التقرير، ضمن ما يتضمن، ما يلي:\n  • ملخص تقارير العمليات المشبوهة (STRs) المقدمة إلى الإدارة العامة للتحريات المالية خلال الربع؛\n  • إحصاءات إجراءات العناية الواجبة تجاه العملاء (CDD) والعناية الواجبة المعززة (EDD)؛\n  • نتائج الفحص مقابل قوائم العقوبات، والحالات المطابقة الفعلية المبلَّغ عنها؛\n  • معدلات إنجاز التدريب عبر خطوط الدفاع الأول والثاني والثالث؛\n  • أبرز القضايا المتعلقة بمكافحة غسل الأموال وتمويل الإرهاب، وحالة المعالجة، والإجراءات الإدارية.\n\nوقد راجع التقريرَ مسؤولُ الإبلاغ عن غسل الأموال واعتمدته لجنة المراجعة والالتزام المنبثقة عن مجلس الإدارة قبل إرساله. وقد أُرفقت جداول البيانات والمرفقات الداعمة.\n\nنحن على استعداد لتقديم أي معلومات أو إيضاحات إضافية قد يطلبها البنك المركزي.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-006',
    name: 'Annual Compliance Report',
    type: 'submission',
    icon: 'lucide:file-text',
    color: 'amber',
    description: 'Submit annual compliance assessment to SAMA.',
    status: 'Active',
    createdDate: 'Jan 10, 2024',
    lastModified: 'Dec 15, 2024',
    usageCount: 4,
    defaultSubjectEn: 'Annual Compliance Assessment Report — [Year]',
    defaultSubjectAr: 'التقرير السنوي لتقييم الالتزام — [السنة]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nIn line with SAMA\'s governance and compliance framework, we are pleased to submit the bank\'s Annual Compliance Assessment Report for the year ended [Year].\n\nThe report presents:\n  • The Compliance function\'s annual plan execution and key performance indicators;\n  • The outcome of the compliance risk assessment across all business lines;\n  • Material compliance incidents, regulatory correspondence, and enforcement actions (if any), together with root-cause analysis and corrective actions;\n  • Status of open compliance findings raised by internal audit, external audit, and SAMA inspections;\n  • The Compliance Officer\'s overall opinion on the adequacy and effectiveness of the compliance framework.\n\nThe report has been reviewed by the Chief Compliance Officer and approved by the Board Audit & Compliance Committee on [Date]. A signed copy, along with all supporting annexures, is enclosed.\n\nWe remain at your disposal for any follow-up inquiries.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nتماشياً مع إطار الحوكمة والالتزام الصادر عن البنك المركزي السعودي، يسعدنا تقديم تقرير التقييم السنوي للالتزام للبنك عن السنة المنتهية في [السنة].\n\nويعرض التقرير ما يلي:\n  • تنفيذ الخطة السنوية لإدارة الالتزام ومؤشرات الأداء الرئيسية؛\n  • نتائج تقييم مخاطر الالتزام عبر خطوط الأعمال كافة؛\n  • الحوادث الجوهرية المتعلقة بالالتزام والمراسلات التنظيمية والإجراءات العقابية (إن وجدت)، مع تحليل الأسباب الجذرية والإجراءات التصحيحية؛\n  • حالة الملاحظات المفتوحة المرفوعة من المراجعة الداخلية والخارجية وتفتيش البنك المركزي؛\n  • الرأي العام لمسؤول الالتزام حول كفاية وفعالية إطار الالتزام.\n\nوقد راجع التقريرَ الرئيسُ التنفيذي للالتزام واعتمدته لجنة المراجعة والالتزام المنبثقة عن مجلس الإدارة بتاريخ [التاريخ]. وقد أُرفقت نسخة موقعة من التقرير مع جميع المرفقات الداعمة.\n\nنحن تحت تصرفكم للرد على أي استفسارات لاحقة.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-007',
    name: 'Incident Notification',
    type: 'notification',
    icon: 'lucide:alert-triangle',
    color: 'rose',
    description: 'Reporting outages, breaches, or structural changes.',
    status: 'Active',
    createdDate: 'Apr 12, 2024',
    lastModified: 'Jul 30, 2024',
    usageCount: 8,
    defaultSubjectEn: 'Incident Notification — [Incident Type / Reference]',
    defaultSubjectAr: 'إشعار حادثة — [نوع الحادثة / المرجع]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nPursuant to SAMA\'s incident notification requirements, we hereby notify you of an incident classified as [severity / category] that occurred on [Date] at approximately [Time] (Saudi Arabia Time).\n\nIncident summary: [Concise factual description of the event, the systems or processes affected, and the customer or operational impact observed to date.]\n\nRoot cause (preliminary): [State the working hypothesis, noting that investigation is ongoing.]\n\nContainment and response: The bank activated its incident response protocol at [Time]. Actions taken include [list the principal containment and recovery measures]. Services were fully restored at [Time] / remain partially impacted as follows [describe].\n\nCustomer / market impact: [Quantify affected customers, transactions, or services; note any financial or reputational impact known at the time of writing.]\n\nNext steps: A full post-incident review, including definitive root-cause analysis and preventive measures, will be provided to SAMA by [Committed Date]. We will continue to keep you informed of material developments.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nاستناداً إلى متطلبات البنك المركزي السعودي المتعلقة بالإبلاغ عن الحوادث، نخطركم بوقوع حادثة مُصنَّفة بأنها [درجة الخطورة / الفئة] في تاريخ [التاريخ] الساعة [الوقت] تقريباً بتوقيت المملكة العربية السعودية.\n\nملخص الحادثة: [وصف وقائعي موجز للحدث، والأنظمة أو الإجراءات المتأثرة، والأثر على العملاء أو العمليات المرصود حتى تاريخه.]\n\nالسبب الجذري (مبدئي): [تُذكر الفرضية الأولية مع الإشارة إلى أن التحقيق لا يزال جارياً.]\n\nالاحتواء والاستجابة: فعّل البنك بروتوكول الاستجابة للحوادث الساعة [الوقت]. وتشمل الإجراءات المتخذة [قائمة تدابير الاحتواء والتعافي الرئيسية]. وقد أُعيدت الخدمات بالكامل الساعة [الوقت] / لا تزال متأثرة جزئياً على النحو التالي [يُوصف].\n\nالأثر على العملاء / السوق: [يُحدَّد عدد العملاء أو العمليات أو الخدمات المتأثرة؛ وتُذكر أي آثار مالية أو سمعية معلومة وقت الكتابة.]\n\nالخطوات التالية: سيُرفع للبنك المركزي تقرير مراجعة شامل بعد الحادثة، يتضمن تحليلاً نهائياً للأسباب الجذرية والتدابير الوقائية، في موعد أقصاه [التاريخ المستهدف]. وسنواصل إبلاغكم بأي تطورات جوهرية.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
  {
    id: 'tmpl-008',
    name: 'System Outage Report',
    type: 'notification',
    icon: 'lucide:server-crash',
    color: 'rose',
    description: 'Report critical system outages affecting banking services.',
    status: 'Active',
    createdDate: 'May 20, 2024',
    lastModified: 'Nov 05, 2024',
    usageCount: 3,
    defaultSubjectEn: 'System Outage Report — [Service / Channel]',
    defaultSubjectAr: 'تقرير انقطاع نظام — [الخدمة / القناة]',
    defaultBodyEn:
      'Dear Sir/Madam,\n\nWe are writing to formally report a system outage affecting [Service / Channel — e.g., Mobile Banking, ATM Network, Core Banking] that commenced on [Date] at [Start Time] and was fully restored on [Date] at [End Time] (Saudi Arabia Time), representing a total service disruption of [Duration].\n\nAffected services: [List the customer-facing and internal services impacted, including any dependent channels.]\n\nRoot cause: [State the confirmed or preliminary root cause — e.g., infrastructure failure, application defect, third-party provider incident.]\n\nCustomer impact: Approximately [number] customers and [number] transactions were affected, with an estimated financial impact of [SAR amount or "no direct financial loss"]. Customer complaints logged during the incident window totalled [number].\n\nRemediation and preventive measures: Immediate stabilisation actions included [summary]. Longer-term preventive measures include [summary — e.g., capacity upgrade, redundancy strengthening, vendor SLA review], with target completion by [Date].\n\nWe remain committed to transparency and will provide any additional information SAMA may require.\n\nRespectfully,',
    defaultBodyAr:
      'حضرة المسؤول المحترم،\n\nنتشرف بإبلاغكم رسمياً بانقطاع في النظام أثّر على [الخدمة / القناة — مثل الخدمات المصرفية عبر الجوال، شبكة الصراف الآلي، النظام المصرفي الأساسي]، بدأ في تاريخ [التاريخ] الساعة [وقت البداية]، وأُعيدت الخدمة كاملةً في تاريخ [التاريخ] الساعة [وقت النهاية] بتوقيت المملكة العربية السعودية، بمجموع انقطاع قدره [المدة].\n\nالخدمات المتأثرة: [تُذكر الخدمات المتأثرة الموجهة للعملاء والخدمات الداخلية، بما في ذلك القنوات المرتبطة.]\n\nالسبب الجذري: [يُذكر السبب الجذري المؤكد أو المبدئي — مثل عطل بنية تحتية، خلل تطبيقي، حادثة لدى مزود خدمة طرف ثالث.]\n\nالأثر على العملاء: تأثر ما يقارب [العدد] من العملاء و[العدد] من العمليات، بأثر مالي تقديري قدره [المبلغ بالريال السعودي أو "لا خسائر مالية مباشرة"]. وبلغ إجمالي شكاوى العملاء المسجلة خلال نافذة الحادثة [العدد].\n\nالإجراءات التصحيحية والوقائية: شملت إجراءات الاستقرار الفورية [ملخص]. وتشمل التدابير الوقائية طويلة المدى [ملخص — مثل رفع السعة، وتعزيز التكرار، ومراجعة اتفاقية مستوى الخدمة مع المورد]، ويُستهدف إنجازها بحلول [التاريخ].\n\nنحن ملتزمون بالشفافية وسنقدم أي معلومات إضافية قد يطلبها البنك المركزي.\n\nوتفضلوا بقبول فائق الاحترام والتقدير،',
  },
]

interface SAMATemplateState {
  templates: LetterTemplate[]
  create: (data: Omit<LetterTemplate, 'id' | 'createdDate' | 'lastModified' | 'usageCount'>) => LetterTemplate
  update: (id: string, data: Partial<LetterTemplate>) => void
  delete: (id: string) => void
  incrementUsage: (id: string) => void
}

export const useSAMATemplateStore = create<SAMATemplateState>()(
  persist(
    (set) => ({
      templates: seedTemplates,

      create: (data) => {
        requirePermission('Manage Letter Templates', { storeName: 'samaTemplate', actionName: 'create' })
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const newTemplate: LetterTemplate = {
          ...data,
          icon: data.icon || typeIcons[data.type],
          color: data.color || typeColors[data.type],
          id: `tmpl-${Date.now()}`,
          createdDate: now,
          lastModified: now,
          usageCount: 0,
        }
        set((s) => ({ templates: [newTemplate, ...s.templates] }))
        return newTemplate
      },

      update: (id, data) => {
        requirePermission('Manage Letter Templates', { storeName: 'samaTemplate', actionName: 'update', id })
        const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, ...data, lastModified: now } : t
          ),
        }))
      },

      delete: (id) => {
        requirePermission('Manage Letter Templates', { storeName: 'samaTemplate', actionName: 'delete', id })
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
      },

      incrementUsage: (id) =>
        set((s) => ({
          templates: s.templates.map((t) =>
            t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t
          ),
        })),
    }),
    {
      name: 'sama-templates',
      version: 2,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted as { templates?: LetterTemplate[] } | undefined) ?? {}
        if (version < 2) {
          const seededById = new Map(seedTemplates.map((t) => [t.id, t]))
          const existing = state.templates ?? []
          const seenIds = new Set<string>()
          const merged: LetterTemplate[] = []
          for (const tmpl of existing) {
            const seed = seededById.get(tmpl.id)
            if (seed) {
              merged.push({
                ...tmpl,
                defaultSubjectEn: tmpl.defaultSubjectEn ?? seed.defaultSubjectEn,
                defaultSubjectAr: tmpl.defaultSubjectAr ?? seed.defaultSubjectAr,
                defaultBodyEn: tmpl.defaultBodyEn ?? seed.defaultBodyEn,
                defaultBodyAr: tmpl.defaultBodyAr ?? seed.defaultBodyAr,
              })
            } else {
              merged.push(tmpl)
            }
            seenIds.add(tmpl.id)
          }
          for (const seed of seedTemplates) {
            if (!seenIds.has(seed.id)) merged.push(seed)
          }
          return { ...state, templates: merged }
        }
        return state
      },
    },
  )
)
