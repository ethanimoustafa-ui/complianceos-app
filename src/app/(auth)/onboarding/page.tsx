'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useFrameworkConfigStore } from '@/stores/framework-config-store'

// Types
type OrgSize = '1-20' | '21-100' | '101-500' | '500+'
type Industry = 'government' | 'banking' | 'energy' | 'healthcare' | 'technology'
type Region = 'riyadh' | 'makkah' | 'eastern' | 'other'

const iconColorMap: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-600' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-600' },
  violet: { bg: 'bg-violet-100', text: 'text-violet-600' },
  rose: { bg: 'bg-rose-100', text: 'text-rose-600' },
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-600' },
  orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
}

// Static integration cards (non-functional, shown behind blur)
const integrationCards = [
  { name: 'Amazon Web Services', icon: 'logos:aws' },
  { name: 'Microsoft Azure', icon: 'logos:microsoft-azure' },
  { name: 'Google Cloud Platform', icon: 'logos:google-cloud' },
  { name: 'GitHub Enterprise', icon: 'mdi:github' },
]

// Zod Schemas for each step
const step1Schema = z.object({
  selectedFrameworks: z
    .array(z.string())
    .min(1, 'Please select at least one framework'),
})

const step2Schema = z.object({
  companyName: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must be less than 100 characters'),
  orgSize: z.enum(['1-20', '21-100', '101-500', '500+']),
  industry: z.enum(['government', 'banking', 'energy', 'healthcare', 'technology']),
  region: z.enum(['riyadh', 'makkah', 'eastern', 'other']),
})

// Combined schema for the entire form
const onboardingSchema = z.object({
  selectedFrameworks: step1Schema.shape.selectedFrameworks,
  companyName: step2Schema.shape.companyName,
  orgSize: step2Schema.shape.orgSize,
  industry: step2Schema.shape.industry,
  region: step2Schema.shape.region,
})

type OnboardingFormData = z.infer<typeof onboardingSchema>

export default function OnboardingPage() {
  const router = useRouter()
  const { t, isRTL, language, toggleLanguage } = useTranslation()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAllModal, setShowAllModal] = useState(false)

  const allFrameworks = useFrameworkConfigStore((s) => s.frameworks)
  const topFrameworks = allFrameworks.slice(0, 6)

  // React Hook Form setup
  const {
    control,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<OnboardingFormData>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      selectedFrameworks: [],
      companyName: '',
      orgSize: '21-100',
      industry: 'technology',
      region: 'riyadh',
    },
    mode: 'onChange',
  })

  const selectedFrameworks = watch('selectedFrameworks')

  const steps = [
    { id: 1, label: t('onboarding.frameworks') },
    { id: 2, label: t('onboarding.company') },
    { id: 3, label: t('onboarding.connect') },
  ]

  const toggleFramework = (id: string) => {
    const current = selectedFrameworks
    const updated = current.includes(id)
      ? current.filter((f) => f !== id)
      : [...current, id]
    setValue('selectedFrameworks', updated, { shouldValidate: true })
  }

  const handleNext = async () => {
    let isValid = false

    if (currentStep === 1) {
      isValid = await trigger('selectedFrameworks')
    } else if (currentStep === 2) {
      isValid = await trigger(['companyName', 'orgSize', 'industry', 'region'])
    }

    if (isValid && currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const onSubmit = async (data: OnboardingFormData) => {
    setIsSubmitting(true)
    try {
      // Persist framework selections to the store
      const store = useFrameworkConfigStore.getState()
      for (const fw of store.frameworks) {
        const shouldBeEnabled = data.selectedFrameworks.includes(fw.id)
        if (shouldBeEnabled !== fw.enabled) {
          store.toggleEnabled(fw.id)
        }
      }
      // Pin first 3 selected if none are pinned yet
      const currentPinned = store.pinnedIds
      if (currentPinned.length === 0) {
        data.selectedFrameworks.slice(0, 3).forEach((id) => store.pinFramework(id as any))
      }

      // TODO: Replace with actual API call
      console.log('Onboarding data:', data)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      router.push('/welcome')
    } catch (error) {
      console.error('Onboarding error:', error)
      setIsSubmitting(false)
    }
  }

  const handleFinish = () => {
    handleSubmit(onSubmit)()
  }

  const getIconColors = (iconColor: string) =>
    iconColorMap[iconColor] || { bg: 'bg-slate-100', text: 'text-slate-600' }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center transform group-hover:scale-105 transition-transform duration-300">
              <Icon icon="lucide:shield-check" className="text-white text-2xl" />
            </div>
            <span className="text-xl font-bold text-slate-900">ComplianceOS</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium text-slate-600">{t('onboarding.setup')}</div>
            <button
              onClick={toggleLanguage}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer`}
            >
              <Icon icon="lucide:globe" className="text-lg" />
              <span>{language === 'en' ? '\u0627\u0644\u0639\u0631\u0628\u064a\u0629' : 'English'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-28 pb-24 flex flex-col items-center">
        <div className="w-full max-w-4xl px-6">
          {/* Progress Steps */}
          <nav className="mb-12 flex justify-between items-center relative">
            <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-100 -z-10" />

            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-4">
                <div
                  className={cn(
                    'w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold transition-all duration-300',
                    currentStep === step.id
                      ? 'border-emerald-600 text-emerald-600 bg-emerald-50'
                      : currentStep > step.id
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 text-slate-400'
                  )}
                >
                  {currentStep > step.id ? (
                    <Icon icon="lucide:check" className="text-lg" />
                  ) : (
                    step.id
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wider',
                    currentStep === step.id
                      ? 'text-emerald-600'
                      : currentStep > step.id
                        ? 'text-slate-900'
                        : 'text-slate-400'
                  )}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </nav>

          {/* Step Content */}
          <div className="animate-fade-in">
            {/* Step 1: Frameworks */}
            {currentStep === 1 && (
              <section>
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    {t('onboarding.chooseFrameworks')}
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    {t('onboarding.frameworksDescription')}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
                  {topFrameworks.map((fw) => {
                    const colors = getIconColors(fw.iconColor)
                    return (
                      <div
                        key={fw.id}
                        onClick={() => toggleFramework(fw.id)}
                        className={cn(
                          'group cursor-pointer border-2 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg',
                          selectedFrameworks.includes(fw.id)
                            ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                            : 'border-slate-200 hover:border-emerald-200'
                        )}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div
                            className={cn(
                              'w-12 h-12 rounded-xl flex items-center justify-center',
                              colors.bg
                            )}
                          >
                            <Icon
                              icon={fw.icon}
                              className={cn('text-2xl', colors.text)}
                            />
                          </div>
                          {selectedFrameworks.includes(fw.id) && (
                            <Icon
                              icon="lucide:check-circle-2"
                              className="text-2xl text-emerald-600"
                            />
                          )}
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">
                          {isRTL ? fw.nameAr : fw.name}
                        </h3>
                        <p className="text-sm text-slate-500">
                          {isRTL ? fw.descriptionAr : fw.description}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* View All Frameworks Button */}
                <div className="text-center mb-4">
                  <button
                    onClick={() => setShowAllModal(true)}
                    className="text-sm font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                  >
                    {t('settings.viewAllFrameworks')} &rarr;
                  </button>
                </div>

                {/* View All Frameworks Modal */}
                <Modal
                  isOpen={showAllModal}
                  onClose={() => setShowAllModal(false)}
                  title={t('settings.viewAllFrameworks')}
                  subtitle={t('onboarding.frameworksDescription')}
                  size="lg"
                >
                  <div className="max-h-[60vh] overflow-y-auto space-y-2">
                    {allFrameworks.map((fw) => {
                      const colors = getIconColors(fw.iconColor)
                      const isSelected = selectedFrameworks.includes(fw.id)
                      return (
                        <div
                          key={fw.id}
                          onClick={() => toggleFramework(fw.id)}
                          className={cn(
                            'flex items-center gap-4 p-4 border rounded-xl cursor-pointer transition-all',
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/50'
                              : 'border-slate-200 hover:border-emerald-200 hover:bg-slate-50'
                          )}
                        >
                          <div
                            className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                              colors.bg
                            )}
                          >
                            <Icon icon={fw.icon} className={cn('text-xl', colors.text)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900">
                              {isRTL ? fw.nameAr : fw.name}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              {isRTL ? fw.descriptionAr : fw.description}
                            </p>
                          </div>
                          {isSelected && (
                            <Icon
                              icon="lucide:check-circle-2"
                              className="text-xl text-emerald-600 shrink-0"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Modal>

                {/* Validation Error Message */}
                {errors.selectedFrameworks && (
                  <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
                    <Icon icon="lucide:alert-circle" className="text-red-500 text-xl flex-shrink-0" />
                    <p className="text-red-600 text-sm font-medium">
                      {errors.selectedFrameworks.message}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-100 pt-8 mt-8">
                  <Link
                    href="/sign-in"
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                    {t('auth.backToSignIn')}
                  </Link>
                  <Button onClick={handleNext} className="px-10">
                    {t('onboarding.continueToStep2')}
                    <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="text-lg" />
                  </Button>
                </div>
              </section>
            )}

            {/* Step 2: Company */}
            {currentStep === 2 && (
              <section>
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    {t('onboarding.tellUsAboutOrg')}
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    {t('onboarding.orgCustomizeDescription')}
                  </p>
                </div>

                <div className="max-w-xl mx-auto space-y-8 mb-12">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      {t('onboarding.legalCompanyName')}
                    </label>
                    <Controller
                      name="companyName"
                      control={control}
                      render={({ field }) => (
                        <input
                          {...field}
                          type="text"
                          placeholder={t('onboarding.companyPlaceholder')}
                          className={cn(
                            'w-full px-4 py-3.5 bg-white border rounded-lg text-slate-900 focus:outline-none transition-all',
                            errors.companyName
                              ? 'border-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500'
                              : 'border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600'
                          )}
                        />
                      )}
                    />
                    {errors.companyName && (
                      <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                        <Icon icon="lucide:alert-circle" className="text-sm" />
                        {errors.companyName.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        {t('onboarding.organizationSize')}
                      </label>
                      <Controller
                        name="orgSize"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                          >
                            <option value="1-20">{t('onboarding.employees1_20')}</option>
                            <option value="21-100">{t('onboarding.employees21_100')}</option>
                            <option value="101-500">{t('onboarding.employees101_500')}</option>
                            <option value="500+">{t('onboarding.employees500plus')}</option>
                          </select>
                        )}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        {t('onboarding.industry')}
                      </label>
                      <Controller
                        name="industry"
                        control={control}
                        render={({ field }) => (
                          <select
                            {...field}
                            className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                          >
                            <option value="government">{t('onboarding.governmentAgency')}</option>
                            <option value="banking">{t('onboarding.bankingFinance')}</option>
                            <option value="energy">{t('onboarding.energyUtilities')}</option>
                            <option value="healthcare">{t('onboarding.healthcareSeha')}</option>
                            <option value="technology">{t('onboarding.technologySaas')}</option>
                          </select>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      {t('onboarding.headquartersRegion')}
                    </label>
                    <Controller
                      name="region"
                      control={control}
                      render={({ field }) => (
                        <select
                          {...field}
                          className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                        >
                          <option value="riyadh">{t('onboarding.riyadhRegion')}</option>
                          <option value="makkah">{t('onboarding.makkahJeddah')}</option>
                          <option value="eastern">{t('onboarding.easternProvince')}</option>
                          <option value="other">{t('onboarding.otherKsa')}</option>
                        </select>
                      )}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <button
                    onClick={handleBack}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                    {t('common.back')}
                  </button>
                  <Button onClick={handleNext} className="px-10">
                    {t('onboarding.finalStep')}
                    <Icon icon={isRTL ? 'lucide:chevron-left' : 'lucide:chevron-right'} className="text-lg" />
                  </Button>
                </div>
              </section>
            )}

            {/* Step 3: Connect (Coming Soon — blurred) */}
            {currentStep === 3 && (
              <section>
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    {t('onboarding.connectYourStack')}
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    {t('onboarding.stackDescription')}
                  </p>
                </div>

                {/* Blurred integration section */}
                <div className="relative max-w-2xl mx-auto mb-12">
                  {/* Integration cards (behind blur) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {integrationCards.map((integration) => (
                      <div
                        key={integration.name}
                        className="flex items-center gap-4 p-5 border border-slate-200 rounded-xl text-left"
                      >
                        <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg shadow-sm flex items-center justify-center">
                          <Icon icon={integration.icon} className="text-2xl" />
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-900">{integration.name}</div>
                        </div>
                        <Icon
                          icon="lucide:external-link"
                          className="text-slate-300"
                        />
                      </div>
                    ))}
                  </div>

                  <p className="text-center text-sm text-slate-500 mt-6">
                    {t('onboarding.skipIntegrations')}
                  </p>

                  {/* Frosted "Coming Soon" overlay */}
                  <div className="absolute inset-0 rounded-2xl bg-white/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-3">
                    <Badge variant="neutral" className="text-sm font-bold text-slate-500 border-slate-300 px-4 py-1.5">
                      {t('settings.comingSoon')}
                    </Badge>
                    <p className="text-xs text-slate-400 max-w-[240px] text-center">
                      {t('settings.integrationsComingSoonNote')}
                    </p>
                  </div>
                </div>

                {/* Navigation buttons OUTSIDE the blur */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <button
                    onClick={handleBack}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon={isRTL ? 'lucide:arrow-right' : 'lucide:arrow-left'} />
                    {t('common.back')}
                  </button>
                  <Button
                    onClick={handleFinish}
                    disabled={isSubmitting}
                    className="px-12"
                  >
                    {isSubmitting ? (
                      <>
                        <Icon icon="lucide:loader-2" className="animate-spin" />
                        {t('onboarding.settingUp')}
                      </>
                    ) : (
                      <>
                        {t('onboarding.finishGoDashboard')}
                        <Icon icon="lucide:rocket" className="text-lg" />
                      </>
                    )}
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between text-sm">
          <p className="text-slate-500">&copy; 2024 ComplianceOS. {t('onboarding.allRightsReserved')}</p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-slate-600 hover:text-emerald-600 transition-colors"
            >
              {t('auth.privacyPolicy')}
            </a>
            <a
              href="#"
              className="text-slate-600 hover:text-emerald-600 transition-colors"
            >
              {t('auth.termsOfService')}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
