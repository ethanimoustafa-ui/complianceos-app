'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { Modal } from '@/components/ui/modal'

const CATEGORIES_AR = [
  'البداية',
  'التقويم',
  'التقارير',
  'الامتثال',
  'إدارة الفريق',
  'الإعدادات',
]

interface ArHelpArticle {
  id: string
  title: string
  summary: string
  category: string
  content: string
  icon: string
  videoLabel: string
}

const AR_ARTICLES: ArHelpArticle[] = [
  {
    id: 'help-ar-1',
    title: 'بدء استخدام ComplianceOS',
    summary: 'تعلّم أساسيات التنقل في المنصة وإعداد بيئة العمل الخاصة بك.',
    category: 'البداية',
    content: 'ComplianceOS هي منصتك المركزية لإدارة الامتثال التنظيمي. ابدأ بمراجعة لوحة المعلومات التي توفر مؤشرات صحية آنية لجميع الأطر التنظيمية. استخدم الشريط الجانبي للوصول إلى التقويم، المراسلات، التقارير، إدارة الفريق، والإعدادات. صُمّم كل قسم لتبسيط سير عمل الامتثال من تتبع الملاحظات إلى إدارة خطابات ساما.',
    icon: 'lucide:rocket',
    videoLabel: 'فيديو تعريفي — قريبًا',
  },
  {
    id: 'help-ar-2',
    title: 'فهم لوحة المعلومات',
    summary: 'شرح العروض التنفيذية والإدارية وعروض المسؤولين.',
    category: 'البداية',
    content: 'توفر لوحة المعلومات ثلاث عروض: التنفيذي (مؤشرات الصحة العامة والاتجاهات)، الإداري (تفاصيل الأقسام وبنود العمل)، والمسؤول (قوائم المهام التفصيلية والمواعيد النهائية). بدّل بين العروض من خلال المحوّل في الزاوية. كل عرض يجمع البيانات من جميع مخازن الامتثال لتقديم رؤى آنية.',
    icon: 'lucide:layout-grid',
    videoLabel: 'فيديو شرح لوحة المعلومات — قريبًا',
  },
  {
    id: 'help-ar-3',
    title: 'استخدام التقويم',
    summary: 'تتبع المواعيد النهائية والمراجعات والتقديمات عبر جميع مجالات الامتثال.',
    category: 'التقويم',
    content: 'يجمع التقويم الأحداث من 9 مصادر بيانات: التدقيق، الملاحظات، السياسات، خطابات ساما، التعاميم، التدريب، المراسلات، الاستشارات، والمخاطر. الأحداث مرمّزة بالألوان حسب نوع المصدر. انقر على أي حدث للانتقال مباشرة إلى الكيان المصدر. استخدم المرشحات للتركيز على مجالات امتثال محددة.',
    icon: 'lucide:calendar',
    videoLabel: 'فيديو التقويم — قريبًا',
  },
  {
    id: 'help-ar-4',
    title: 'إنشاء التقارير',
    summary: 'أنشئ تقارير الامتثال والتدقيق والمخاطر بنقرة واحدة.',
    category: 'التقارير',
    content: 'انتقل إلى التقارير للوصول إلى نماذج التقارير الجاهزة لصحة الامتثال، نتائج التدقيق، تقييمات المخاطر، وتقديمات ساما. يمكن تصدير التقارير بتنسيقات PDF و Excel و CSV. يحسب محرك الامتثال الدرجات بناءً على أوزان الأطر المكوّنة في الإعدادات. استخدم تبويب الملخص التنفيذي للتقارير الجاهزة لمجلس الإدارة.',
    icon: 'lucide:file-text',
    videoLabel: 'فيديو التقارير — قريبًا',
  },
  {
    id: 'help-ar-5',
    title: 'إدارة الملاحظات',
    summary: 'تتبع وتعيين ومعالجة ملاحظات التدقيق.',
    category: 'الامتثال',
    content: 'يمكن إنشاء الملاحظات من تدقيقات ساما أو التدقيقات الداخلية أو المراجعات الشرعية. تتتبع كل ملاحظة الشدّة والحالة وخطط المعالجة وسير عمل الإغلاق. عيّن أعضاء الفريق، حدد المواعيد النهائية، وراقب التقدم عبر نظام قوائم المهام. يوفر تبويب الجدول الزمني سجلًا كاملًا لجميع التغييرات.',
    icon: 'lucide:eye',
    videoLabel: 'فيديو إدارة الملاحظات — قريبًا',
  },
  {
    id: 'help-ar-6',
    title: 'إدارة دورة حياة السياسات',
    summary: 'أنشئ وراجع واعتمد وتتبع السياسات من البداية إلى النهاية.',
    category: 'الامتثال',
    content: 'تتبع السياسات دورة حياة منظمة: مسودة ← قيد المراجعة ← معتمدة ← تتطلب مراجعة. أعدّ جداول المراجعة مع تذكيرات تلقائية. يدعم نظام سير العمل اعتمادات متعددة المستويات (مجلس الإدارة، الإدارة، الشرعية، الجمعية العمومية). أرفق مستندات الأدلة وتتبع تاريخ الإصدارات. استخدم نماذج السياسات من الإعدادات لتوحيد الإنشاء.',
    icon: 'lucide:file-check',
    videoLabel: 'فيديو السياسات — قريبًا',
  },
  {
    id: 'help-ar-7',
    title: 'خطابات ساما والمراسلات',
    summary: 'صِغ واعتمد وتتبع مراسلات ساما.',
    category: 'الامتثال',
    content: 'أنشئ خطابات ساما باستخدام نماذج لأنواع عدم الممانعة والاستفسار والتقديم والإخطار. تمر الخطابات بسلسلة اعتماد من 3 مراحل (مسؤول الامتثال ← رئيس القسم ← الرئيس التنفيذي). تتبع مواعيد الردود واربط الملاحظات ذات الصلة. تُدير وحدة المراسلات أيضًا مراسلات المدققين الخارجيين والموردين.',
    icon: 'lucide:mail',
    videoLabel: 'فيديو خطابات ساما — قريبًا',
  },
  {
    id: 'help-ar-8',
    title: 'الفريق والصلاحيات',
    summary: 'إدارة أعضاء الفريق والأدوار وضوابط الوصول.',
    category: 'إدارة الفريق',
    content: 'أضف أعضاء الفريق عبر الدعوة، عيّن الأدوار (مسؤول، مدير، مشرف)، وهيّئ الصلاحيات التفصيلية. يعرض الدليل توزيع عبء العمل وكشف الإرهاق. استخدم وحدة التدريب لتتبع شهادات الموظفين وتقدم التدريب على الامتثال. تُتبّع مقاييس السعودة تلقائيًا.',
    icon: 'lucide:users',
    videoLabel: 'فيديو إدارة الفريق — قريبًا',
  },
  {
    id: 'help-ar-9',
    title: 'تهيئة الأطر التنظيمية',
    summary: 'أعدّ الأطر التنظيمية والأوزان والعتبات.',
    category: 'الإعدادات',
    content: 'انتقل إلى الإعدادات ← الأطر التنظيمية لتفعيل الجهات الرقابية (ساما، الهيئة الوطنية للأمن السيبراني، سدايا، وغيرها). هيّئ أوزان الامتثال للتحكم في مساهمة التدقيق والملاحظات والسياسات في مؤشر الصحة. حدد العتبات (صارم، قياسي، مرن) لتعريف أهداف الامتثال. ثبّت حتى 3 أطر لعرضها في لوحة المعلومات.',
    icon: 'lucide:sliders',
    videoLabel: 'فيديو الأطر التنظيمية — قريبًا',
  },
  {
    id: 'help-ar-10',
    title: 'تفضيلات الإشعارات',
    summary: 'خصّص التنبيهات حسب الوحدة ونوع الحدث والنطاق.',
    category: 'الإعدادات',
    content: 'هيّئ الوحدات التي تولّد إشعارات (التعاميم، السياسات، التدقيق، الملاحظات، خطابات ساما، التدريب). اختر أنواع الأحداث (المواعيد النهائية، التنبيهات الحرجة، طلبات الاعتماد، العناصر المتأخرة، تغييرات الحالة) والنطاق (عناصري، العناصر المُدارة، جميع العناصر). فعّل ملخصات البريد الأسبوعية وتكامل Slack للتنبيهات الفورية.',
    icon: 'lucide:bell',
    videoLabel: 'فيديو الإشعارات — قريبًا',
  },
]

interface HelpPanelArProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpPanelAr({ isOpen, onClose }: HelpPanelArProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null)

  const activeArticle = activeArticleId ? AR_ARTICLES.find(a => a.id === activeArticleId) : null

  const filteredArticles = search
    ? AR_ARTICLES.filter(a =>
        a.title.includes(search) || a.summary.includes(search) || a.category.includes(search)
      )
    : activeCategory
      ? AR_ARTICLES.filter(a => a.category === activeCategory)
      : AR_ARTICLES

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (activeArticleId) { setActiveArticleId(null) }
      else { onClose() }
    }
  }, [onClose, activeArticleId])

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, handleEscape])

  useEffect(() => {
    if (!isOpen) { setActiveArticleId(null); setSearch(''); setActiveCategory(null) }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex" dir="rtl">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

        <div className="me-auto relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full animate-slide-in-left">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-xl font-bold text-slate-900">مركز المساعدة</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
              <Icon icon="lucide:x" className="text-2xl" />
            </button>
          </div>

          {/* Search */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="relative">
              <Icon icon="lucide:search" className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveCategory(null) }}
                placeholder="البحث في مقالات المساعدة..."
                className="w-full ps-10 pe-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Category pills */}
          {!search && (
            <div className="px-6 py-3 flex flex-wrap gap-2 border-b border-slate-100">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
                  !activeCategory ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                الكل
              </button>
              {CATEGORIES_AR.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer',
                    activeCategory === cat ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Article list */}
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                <Icon icon="lucide:search-x" className="text-4xl mb-3" />
                <p className="text-sm font-medium">لم يتم العثور على مقالات</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredArticles.map(article => (
                  <button
                    key={article.id}
                    onClick={() => setActiveArticleId(article.id)}
                    className="w-full text-start p-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                        <Icon icon={article.icon} className="text-xl" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900">{article.title}</p>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{article.summary}</p>
                        <span className="inline-block mt-2 text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {article.category}
                        </span>
                      </div>
                      <Icon icon="lucide:chevron-left" className="text-slate-300 shrink-0 mt-2" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Article Detail Modal */}
      <Modal
        isOpen={!!activeArticle}
        onClose={() => setActiveArticleId(null)}
        title={activeArticle?.title}
        size="lg"
      >
        {activeArticle && (
          <div className="space-y-6" dir="rtl">
            {/* Category + Icon header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Icon icon={activeArticle.icon} className="text-2xl" />
              </div>
              <div>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                  {activeArticle.category}
                </span>
              </div>
            </div>

            {/* Video placeholder — Arabic-specific label */}
            <div className="w-full aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center gap-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-bl from-emerald-900/30 to-slate-900/80" />
              <div className="relative z-10 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                  <Icon icon="lucide:play" className="text-3xl text-white me-1" />
                </div>
                <p className="text-sm font-medium text-white/80">{activeArticle.videoLabel}</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-sm text-slate-500 mb-2 font-bold uppercase tracking-wider">الوصف</p>
              <p className="text-sm text-slate-600 leading-relaxed">{activeArticle.content}</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
