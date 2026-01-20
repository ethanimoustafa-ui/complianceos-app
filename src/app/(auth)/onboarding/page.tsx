'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

// Types
type FrameworkId = 'nca-ecc' | 'sama-csf' | 'ndmo-pdpl' | 'nca-cscc' | 'citc' | 'nca-ccc'
type OrgSize = '1-20' | '21-100' | '101-500' | '500+'
type Industry = 'government' | 'banking' | 'energy' | 'healthcare' | 'technology'
type Region = 'riyadh' | 'makkah' | 'eastern' | 'other'

interface Framework {
  id: FrameworkId
  nameKey: string
  descriptionKey: string
  icon: string
  iconBg: string
  iconColor: string
}

interface Integration {
  id: string
  nameKey: string
  descriptionKey: string
  icon: string
}

// Data
const frameworks: Framework[] = [
  {
    id: 'nca-ecc',
    nameKey: 'onboarding.ncaEccName',
    descriptionKey: 'onboarding.ncaEccDescription',
    icon: 'lucide:shield-check',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    id: 'sama-csf',
    nameKey: 'onboarding.samaCsfName',
    descriptionKey: 'onboarding.samaCsfDescription',
    icon: 'lucide:landmark',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    id: 'ndmo-pdpl',
    nameKey: 'onboarding.ndmoPdplName',
    descriptionKey: 'onboarding.ndmoPdplDescription',
    icon: 'lucide:database-zap',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    id: 'nca-cscc',
    nameKey: 'onboarding.ncaCsccName',
    descriptionKey: 'onboarding.ncaCsccDescription',
    icon: 'lucide:activity',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    id: 'citc',
    nameKey: 'onboarding.citcName',
    descriptionKey: 'onboarding.citcDescription',
    icon: 'lucide:rss',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    id: 'nca-ccc',
    nameKey: 'onboarding.ncaCccName',
    descriptionKey: 'onboarding.ncaCccDescription',
    icon: 'lucide:cloud-cog',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
]

const integrations: Integration[] = [
  {
    id: 'aws',
    nameKey: 'onboarding.awsName',
    descriptionKey: 'onboarding.awsDescription',
    icon: 'logos:aws',
  },
  {
    id: 'azure',
    nameKey: 'onboarding.azureName',
    descriptionKey: 'onboarding.azureDescription',
    icon: 'logos:microsoft-azure',
  },
  {
    id: 'gcp',
    nameKey: 'onboarding.gcpName',
    descriptionKey: 'onboarding.gcpDescription',
    icon: 'logos:google-cloud',
  },
  {
    id: 'github',
    nameKey: 'onboarding.githubName',
    descriptionKey: 'onboarding.githubDescription',
    icon: 'mdi:github',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const { t, isRTL } = useTranslation()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [selectedFrameworks, setSelectedFrameworks] = useState<FrameworkId[]>([])
  const [companyName, setCompanyName] = useState('')
  const [orgSize, setOrgSize] = useState<OrgSize>('21-100')
  const [industry, setIndustry] = useState<Industry>('technology')
  const [region, setRegion] = useState<Region>('riyadh')
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([])

  const steps = [
    { id: 1, label: t('onboarding.frameworks') },
    { id: 2, label: t('onboarding.company') },
    { id: 3, label: t('onboarding.connect') },
  ]

  const toggleFramework = (id: FrameworkId) => {
    setSelectedFrameworks((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    )
  }

  const toggleIntegration = (id: string) => {
    setSelectedIntegrations((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFinish = async () => {
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    router.push('/dashboard')
  }

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
          <div className="text-sm font-medium text-slate-600">{t('onboarding.setup')}</div>
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

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                  {frameworks.map((framework) => (
                    <div
                      key={framework.id}
                      onClick={() => toggleFramework(framework.id)}
                      className={cn(
                        'group cursor-pointer border-2 rounded-2xl p-6 transition-all duration-200 hover:shadow-lg',
                        selectedFrameworks.includes(framework.id)
                          ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-emerald-200'
                      )}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div
                          className={cn(
                            'w-12 h-12 rounded-xl flex items-center justify-center',
                            framework.iconBg
                          )}
                        >
                          <Icon
                            icon={framework.icon}
                            className={cn('text-2xl', framework.iconColor)}
                          />
                        </div>
                        {selectedFrameworks.includes(framework.id) && (
                          <Icon
                            icon="lucide:check-circle-2"
                            className="text-2xl text-emerald-600"
                          />
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 mb-2">
                        {t(framework.nameKey as any)}
                      </h3>
                      <p className="text-sm text-slate-500">{t(framework.descriptionKey as any)}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
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
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder={t('onboarding.companyPlaceholder')}
                      className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        {t('onboarding.organizationSize')}
                      </label>
                      <select
                        value={orgSize}
                        onChange={(e) => setOrgSize(e.target.value as OrgSize)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                      >
                        <option value="1-20">{t('onboarding.employees1_20')}</option>
                        <option value="21-100">{t('onboarding.employees21_100')}</option>
                        <option value="101-500">{t('onboarding.employees101_500')}</option>
                        <option value="500+">{t('onboarding.employees500plus')}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        {t('onboarding.industry')}
                      </label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value as Industry)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                      >
                        <option value="government">{t('onboarding.governmentAgency')}</option>
                        <option value="banking">{t('onboarding.bankingFinance')}</option>
                        <option value="energy">{t('onboarding.energyUtilities')}</option>
                        <option value="healthcare">{t('onboarding.healthcareSeha')}</option>
                        <option value="technology">{t('onboarding.technologySaas')}</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      {t('onboarding.headquartersRegion')}
                    </label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value as Region)}
                      className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    >
                      <option value="riyadh">{t('onboarding.riyadhRegion')}</option>
                      <option value="makkah">{t('onboarding.makkahJeddah')}</option>
                      <option value="eastern">{t('onboarding.easternProvince')}</option>
                      <option value="other">{t('onboarding.otherKsa')}</option>
                    </select>
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

            {/* Step 3: Connect */}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-12">
                  {integrations.map((integration) => (
                    <button
                      key={integration.id}
                      onClick={() => toggleIntegration(integration.id)}
                      className={cn(
                        'flex items-center gap-4 p-5 border rounded-xl transition-all text-left group',
                        selectedIntegrations.includes(integration.id)
                          ? 'border-emerald-600 bg-emerald-50/50'
                          : 'border-slate-200 hover:bg-slate-50 hover:border-emerald-300'
                      )}
                    >
                      <div className="w-12 h-12 bg-white border border-slate-100 rounded-lg shadow-sm flex items-center justify-center">
                        <Icon icon={integration.icon} className="text-2xl" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">{t(integration.nameKey as any)}</div>
                        <div className="text-xs text-slate-500">
                          {t(integration.descriptionKey as any)}
                        </div>
                      </div>
                      {selectedIntegrations.includes(integration.id) ? (
                        <Icon
                          icon="lucide:check-circle-2"
                          className="text-emerald-600 text-xl"
                        />
                      ) : (
                        <Icon
                          icon="lucide:external-link"
                          className="text-slate-300 group-hover:text-emerald-500"
                        />
                      )}
                    </button>
                  ))}
                </div>

                <p className="text-center text-sm text-slate-500 mb-8">
                  {t('onboarding.skipIntegrations')}
                </p>

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
          <p className="text-slate-500">© 2024 ComplianceOS. {t('onboarding.allRightsReserved')}</p>
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
