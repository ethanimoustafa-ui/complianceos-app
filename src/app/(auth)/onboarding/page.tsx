'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Types
type FrameworkId = 'nca-ecc' | 'sama-csf' | 'ndmo-pdpl' | 'nca-cscc' | 'citc' | 'nca-ccc'
type OrgSize = '1-20' | '21-100' | '101-500' | '500+'
type Industry = 'government' | 'banking' | 'energy' | 'healthcare' | 'technology'
type Region = 'riyadh' | 'makkah' | 'eastern' | 'other'

interface Framework {
  id: FrameworkId
  name: string
  description: string
  icon: string
  iconBg: string
  iconColor: string
}

interface Integration {
  id: string
  name: string
  description: string
  icon: string
}

// Data
const frameworks: Framework[] = [
  {
    id: 'nca-ecc',
    name: 'NCA ECC-1:2018',
    description: 'National Cybersecurity Authority Essential Cybersecurity Controls.',
    icon: 'lucide:shield-check',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
  {
    id: 'sama-csf',
    name: 'SAMA CSF',
    description: 'Saudi Central Bank Cyber Security Framework for financial entities.',
    icon: 'lucide:landmark',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    id: 'ndmo-pdpl',
    name: 'NDMO PDPL',
    description: 'National Data Management Office - Personal Data Protection Law.',
    icon: 'lucide:database-zap',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    id: 'nca-cscc',
    name: 'NCA CSCC',
    description: 'Critical Systems Cybersecurity Controls for vital national infrastructure.',
    icon: 'lucide:activity',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-600',
  },
  {
    id: 'citc',
    name: 'CITC Standards',
    description: 'Regulatory framework for telecom and information technology.',
    icon: 'lucide:rss',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    id: 'nca-ccc',
    name: 'NCA CCC',
    description: 'Cloud Cybersecurity Controls for governmental cloud implementations.',
    icon: 'lucide:cloud-cog',
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-600',
  },
]

const integrations: Integration[] = [
  {
    id: 'aws',
    name: 'Amazon Web Services',
    description: 'Connect AWS accounts for audit logs',
    icon: 'logos:aws',
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    description: 'Automate Azure Security Center checks',
    icon: 'logos:microsoft-azure',
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    description: 'Sync GCP projects and assets',
    icon: 'logos:google-cloud',
  },
  {
    id: 'github',
    name: 'GitHub Enterprise',
    description: 'Monitor repository access and policy',
    icon: 'mdi:github',
  },
]

const steps = [
  { id: 1, label: 'Frameworks' },
  { id: 2, label: 'Company' },
  { id: 3, label: 'Connect' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [selectedFrameworks, setSelectedFrameworks] = useState<FrameworkId[]>([])
  const [companyName, setCompanyName] = useState('')
  const [orgSize, setOrgSize] = useState<OrgSize>('21-100')
  const [industry, setIndustry] = useState<Industry>('technology')
  const [region, setRegion] = useState<Region>('riyadh')
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>([])

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
          <div className="text-sm font-medium text-slate-600">Onboarding Setup</div>
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
                    Choose Saudi compliance frameworks
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    Select the Saudi Arabian governmental and regulatory standards your
                    organization needs to adhere to for national compliance.
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
                        {framework.name}
                      </h3>
                      <p className="text-sm text-slate-500">{framework.description}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <Link
                    href="/sign-in"
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon="lucide:arrow-left" />
                    Back to Sign In
                  </Link>
                  <Button onClick={handleNext} className="px-10">
                    Continue to Step 2
                    <Icon icon="lucide:chevron-right" className="text-lg" />
                  </Button>
                </div>
              </section>
            )}

            {/* Step 2: Company */}
            {currentStep === 2 && (
              <section>
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    Tell us about your organization
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    This helps us customize your compliance controls and dashboard
                    experience.
                  </p>
                </div>

                <div className="max-w-xl mx-auto space-y-8 mb-12">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Legal Company Name
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp Inc."
                      className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Organization Size
                      </label>
                      <select
                        value={orgSize}
                        onChange={(e) => setOrgSize(e.target.value as OrgSize)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                      >
                        <option value="1-20">1-20 employees</option>
                        <option value="21-100">21-100 employees</option>
                        <option value="101-500">101-500 employees</option>
                        <option value="500+">500+ employees</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">
                        Industry
                      </label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value as Industry)}
                        className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                      >
                        <option value="government">Government Agency</option>
                        <option value="banking">Banking & Finance (SAMA)</option>
                        <option value="energy">Energy & Utilities</option>
                        <option value="healthcare">Healthcare (Seha)</option>
                        <option value="technology">Technology & SaaS</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Headquarters Region
                    </label>
                    <select
                      value={region}
                      onChange={(e) => setRegion(e.target.value as Region)}
                      className="w-full px-4 py-3.5 bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition-all"
                    >
                      <option value="riyadh">Riyadh Region</option>
                      <option value="makkah">Makkah / Jeddah Region</option>
                      <option value="eastern">Eastern Province</option>
                      <option value="other">Other KSA Region</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <button
                    onClick={handleBack}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon="lucide:arrow-left" />
                    Back
                  </button>
                  <Button onClick={handleNext} className="px-10">
                    Final Step
                    <Icon icon="lucide:chevron-right" className="text-lg" />
                  </Button>
                </div>
              </section>
            )}

            {/* Step 3: Connect */}
            {currentStep === 3 && (
              <section>
                <div className="text-center mb-10">
                  <h1 className="text-3xl font-bold text-slate-900 mb-3">
                    Connect your stack
                  </h1>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    ComplianceOS automatically monitors your infrastructure. Connect your
                    cloud provider to begin scanning.
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
                        <div className="font-bold text-slate-900">{integration.name}</div>
                        <div className="text-xs text-slate-500">
                          {integration.description}
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
                  You can skip this step and connect integrations later from Settings.
                </p>

                <div className="flex items-center justify-between border-t border-slate-100 pt-8">
                  <button
                    onClick={handleBack}
                    className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
                  >
                    <Icon icon="lucide:arrow-left" />
                    Back
                  </button>
                  <Button
                    onClick={handleFinish}
                    disabled={isSubmitting}
                    className="px-12"
                  >
                    {isSubmitting ? (
                      <>
                        <Icon icon="lucide:loader-2" className="animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        Finish & Go to Dashboard
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
          <p className="text-slate-500">© 2024 ComplianceOS. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-slate-600 hover:text-emerald-600 transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="#"
              className="text-slate-600 hover:text-emerald-600 transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
