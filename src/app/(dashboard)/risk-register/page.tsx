'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Drawer } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'

// Types
type RiskCategory = 'operational' | 'financial' | 'compliance' | 'strategic' | 'reputational'
type RiskStatus = 'open' | 'mitigating' | 'accepted' | 'closed'

interface Risk {
  id: string
  name: string
  description: string
  category: RiskCategory
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  owner: {
    name: string
    avatar: string
    department: string
  }
  status: RiskStatus
  mitigationPlan?: string
  mitigationProgress: number
  createdAt: Date
  updatedAt: Date
}

// Config
const categoryConfig: Record<RiskCategory, { label: string; icon: string; color: string }> = {
  operational: { label: 'Operational', icon: 'lucide:settings', color: 'bg-blue-100 text-blue-700' },
  financial: { label: 'Financial', icon: 'lucide:dollar-sign', color: 'bg-emerald-100 text-emerald-700' },
  compliance: { label: 'Compliance', icon: 'lucide:shield', color: 'bg-purple-100 text-purple-700' },
  strategic: { label: 'Strategic', icon: 'lucide:target', color: 'bg-amber-100 text-amber-700' },
  reputational: { label: 'Reputational', icon: 'lucide:users', color: 'bg-rose-100 text-rose-700' },
}

const statusConfig: Record<RiskStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-rose-100 text-rose-700' },
  mitigating: { label: 'Mitigating', color: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepted', color: 'bg-blue-100 text-blue-700' },
  closed: { label: 'Closed', color: 'bg-emerald-100 text-emerald-700' },
}

const likelihoodLabels = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']
const impactLabels = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic']

// Mock data
const mockRisks: Risk[] = [
  {
    id: 'RSK-001',
    name: 'Data Breach - Customer Records',
    description: 'Potential unauthorized access to customer personal and financial data through system vulnerabilities.',
    category: 'compliance',
    likelihood: 4,
    impact: 5,
    owner: { name: 'Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', department: 'IT Security' },
    status: 'mitigating',
    mitigationPlan: 'Implementing enhanced encryption and access controls',
    mitigationProgress: 65,
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-20'),
  },
  {
    id: 'RSK-002',
    name: 'SAMA Regulatory Non-Compliance',
    description: 'Risk of non-compliance with SAMA cybersecurity framework requirements.',
    category: 'compliance',
    likelihood: 3,
    impact: 5,
    owner: { name: 'Ahmed Al-Rashid', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed', department: 'Compliance' },
    status: 'open',
    mitigationPlan: 'Gap assessment and remediation roadmap in progress',
    mitigationProgress: 30,
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2024-01-18'),
  },
  {
    id: 'RSK-003',
    name: 'Third-Party Vendor Failure',
    description: 'Critical vendor service disruption affecting core business operations.',
    category: 'operational',
    likelihood: 3,
    impact: 4,
    owner: { name: 'Maria Lopez', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria', department: 'Procurement' },
    status: 'mitigating',
    mitigationPlan: 'Developing alternative vendor relationships',
    mitigationProgress: 45,
    createdAt: new Date('2024-01-08'),
    updatedAt: new Date('2024-01-19'),
  },
  {
    id: 'RSK-004',
    name: 'Market Risk - Interest Rate Fluctuation',
    description: 'Exposure to interest rate changes affecting investment portfolio.',
    category: 'financial',
    likelihood: 4,
    impact: 3,
    owner: { name: 'John Smith', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=John', department: 'Treasury' },
    status: 'accepted',
    mitigationPlan: 'Hedging strategy implemented',
    mitigationProgress: 100,
    createdAt: new Date('2024-01-05'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: 'RSK-005',
    name: 'Cyber Attack - Ransomware',
    description: 'Potential ransomware attack targeting critical infrastructure.',
    category: 'operational',
    likelihood: 4,
    impact: 4,
    owner: { name: 'Sarah Chen', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', department: 'IT Security' },
    status: 'mitigating',
    mitigationPlan: 'Enhanced backup and recovery procedures',
    mitigationProgress: 80,
    createdAt: new Date('2024-01-12'),
    updatedAt: new Date('2024-01-21'),
  },
  {
    id: 'RSK-006',
    name: 'Reputational Damage - Social Media',
    description: 'Negative publicity from social media incidents or customer complaints.',
    category: 'reputational',
    likelihood: 3,
    impact: 3,
    owner: { name: 'Emma Wilson', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma', department: 'Marketing' },
    status: 'open',
    mitigationPlan: 'Social media monitoring and response protocol',
    mitigationProgress: 20,
    createdAt: new Date('2024-01-14'),
    updatedAt: new Date('2024-01-16'),
  },
  {
    id: 'RSK-007',
    name: 'Key Person Dependency',
    description: 'Over-reliance on specific individuals for critical business functions.',
    category: 'strategic',
    likelihood: 3,
    impact: 4,
    owner: { name: 'David Kim', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David', department: 'HR' },
    status: 'mitigating',
    mitigationPlan: 'Knowledge transfer and succession planning',
    mitigationProgress: 55,
    createdAt: new Date('2024-01-06'),
    updatedAt: new Date('2024-01-17'),
  },
  {
    id: 'RSK-008',
    name: 'Documentation Quality Issues',
    description: 'Inadequate documentation of policies and procedures.',
    category: 'operational',
    likelihood: 4,
    impact: 2,
    owner: { name: 'Ahmed Al-Rashid', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed', department: 'Compliance' },
    status: 'closed',
    mitigationPlan: 'Documentation standards and review process implemented',
    mitigationProgress: 100,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-20'),
  },
]

// Helper functions
function getRiskScore(likelihood: number, impact: number): number {
  return likelihood * impact
}

function getRiskLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 20) return { label: 'Critical', color: 'text-rose-700', bgColor: 'bg-rose-500' }
  if (score >= 12) return { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-500' }
  if (score >= 6) return { label: 'Medium', color: 'text-amber-700', bgColor: 'bg-amber-400' }
  return { label: 'Low', color: 'text-emerald-700', bgColor: 'bg-emerald-400' }
}

function getMatrixCellColor(likelihood: number, impact: number): string {
  const score = likelihood * impact
  if (score >= 20) return 'bg-rose-500/20 border-rose-500 hover:bg-rose-500/30'
  if (score >= 12) return 'bg-orange-500/20 border-orange-500 hover:bg-orange-500/30'
  if (score >= 6) return 'bg-amber-400/20 border-amber-400 hover:bg-amber-400/30'
  return 'bg-emerald-400/20 border-emerald-400 hover:bg-emerald-400/30'
}

function getRiskDotColor(score: number): string {
  if (score >= 20) return 'bg-rose-500'
  if (score >= 12) return 'bg-orange-500'
  if (score >= 6) return 'bg-amber-400'
  return 'bg-emerald-400'
}

export default function RiskRegisterPage() {
  const { t, isRTL } = useTranslation()
  const [risks] = useState<Risk[]>(mockRisks)
  const [selectedRisk, setSelectedRisk] = useState<Risk | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [filterCategory, setFilterCategory] = useState<RiskCategory | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<RiskStatus | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Translated category config
  const categoryLabels: Record<RiskCategory, string> = {
    operational: t('riskRegister.operational'),
    financial: t('riskRegister.financial'),
    compliance: t('riskRegister.compliance'),
    strategic: t('riskRegister.strategic'),
    reputational: t('riskRegister.reputational'),
  }

  // Translated status config
  const statusLabels: Record<RiskStatus, string> = {
    open: t('riskRegister.open'),
    mitigating: t('riskRegister.mitigating'),
    accepted: t('riskRegister.accepted'),
    closed: t('riskRegister.closed'),
  }

  // Translated likelihood labels
  const translatedLikelihoodLabels = [
    t('riskRegister.rare'),
    t('riskRegister.unlikely'),
    t('riskRegister.possible'),
    t('riskRegister.likely'),
    t('riskRegister.almostCertain'),
  ]

  // Translated impact labels
  const translatedImpactLabels = [
    t('riskRegister.negligible'),
    t('riskRegister.minor'),
    t('riskRegister.moderate'),
    t('riskRegister.major'),
    t('riskRegister.catastrophic'),
  ]

  // Filter risks
  const filteredRisks = risks.filter((risk) => {
    const matchesCategory = filterCategory === 'all' || risk.category === filterCategory
    const matchesStatus = filterStatus === 'all' || risk.status === filterStatus
    const matchesSearch = risk.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      risk.id.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesStatus && matchesSearch
  })

  // Stats
  const totalRisks = risks.length
  const criticalRisks = risks.filter((r) => getRiskScore(r.likelihood, r.impact) >= 20).length
  const openRisks = risks.filter((r) => r.status === 'open').length
  const avgScore = Math.round(risks.reduce((sum, r) => sum + getRiskScore(r.likelihood, r.impact), 0) / risks.length)

  // Get risks for matrix cell
  const getRisksForCell = (likelihood: number, impact: number) => {
    return risks.filter((r) => r.likelihood === likelihood && r.impact === impact)
  }

  const handleRiskClick = (risk: Risk) => {
    setSelectedRisk(risk)
    setIsDrawerOpen(true)
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className={`flex items-center justify-between mb-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={isRTL ? 'text-right' : ''}>
          <h1 className="text-2xl font-bold text-slate-900">{t('riskRegister.title')}</h1>
          <p className="text-slate-500 mt-1">{t('riskRegister.subtitle')}</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Icon icon="lucide:plus" className="w-4 h-4" />
          {t('riskRegister.addRisk')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                <Icon icon="lucide:alert-triangle" className="text-2xl text-slate-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{totalRisks}</p>
                <p className="text-sm text-slate-500">{t('riskRegister.totalRisks')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center">
                <Icon icon="lucide:alert-octagon" className="text-2xl text-rose-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{criticalRisks}</p>
                <p className="text-sm text-slate-500">{t('riskRegister.criticalRisks')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                <Icon icon="lucide:circle-dot" className="text-2xl text-amber-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{openRisks}</p>
                <p className="text-sm text-slate-500">{t('riskRegister.openRisks')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="stat-card">
          <CardContent className="pt-6">
            <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Icon icon="lucide:gauge" className="text-2xl text-blue-600" />
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-2xl font-bold text-slate-900">{avgScore}</p>
                <p className="text-sm text-slate-500">{t('riskRegister.avgRiskScore')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Risk Matrix - 5x5 */}
        <div className="col-span-7">
          <Card>
            <CardHeader>
              <CardTitle className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Icon icon="lucide:grid-3x3" className="text-slate-400" />
                {t('riskRegister.riskMatrix')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Legend */}
              <div className={`mb-6 flex items-center gap-4 justify-center ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-4 h-4 bg-rose-500 rounded" />
                  <span className="text-xs font-bold text-slate-600">{t('riskRegister.critical')} (20-25)</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-4 h-4 bg-orange-500 rounded" />
                  <span className="text-xs font-bold text-slate-600">{t('riskRegister.high')} (12-19)</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-4 h-4 bg-amber-400 rounded" />
                  <span className="text-xs font-bold text-slate-600">{t('riskRegister.medium')} (6-11)</span>
                </div>
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-4 h-4 bg-emerald-400 rounded" />
                  <span className="text-xs font-bold text-slate-600">{t('riskRegister.low')} (1-5)</span>
                </div>
              </div>

              {/* Matrix */}
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                <div className="flex items-center justify-center mb-4">
                  <div className="text-sm font-bold text-slate-600">{t('riskRegister.likelihood')} {isRTL ? '←' : '→'}</div>
                </div>

                <div className="grid grid-cols-6 gap-2 mb-2">
                  <div />
                  {[1, 2, 3, 4, 5].map((l) => (
                    <div key={l} className="text-[10px] font-bold text-slate-600 text-center">
                      {translatedLikelihoodLabels[l - 1]}
                    </div>
                  ))}
                </div>

                <div className="relative">
                  <div className={`absolute ${isRTL ? 'right-0 translate-x-6' : 'left-0 -translate-x-6'} top-1/2 -translate-y-1/2 ${isRTL ? 'rotate-90' : '-rotate-90'} origin-center whitespace-nowrap text-sm font-bold text-slate-600`}>
                    {t('riskRegister.impact')} {isRTL ? '↓' : '↑'}
                  </div>
                  <div className={`space-y-2 ${isRTL ? 'mr-4' : 'ml-4'}`}>
                    {[5, 4, 3, 2, 1].map((impact) => (
                      <div key={impact} className="grid grid-cols-6 gap-2">
                        <div className={`flex items-center ${isRTL ? 'justify-start pl-2' : 'justify-end pr-2'} text-[10px] font-bold text-slate-600`}>
                          {translatedImpactLabels[impact - 1]}
                        </div>
                        {[1, 2, 3, 4, 5].map((likelihood) => {
                          const cellRisks = getRisksForCell(likelihood, impact)
                          return (
                            <div
                              key={`${impact}-${likelihood}`}
                              className={cn(
                                'min-h-[56px] border-2 rounded-lg p-1 flex flex-wrap gap-1 content-start cursor-pointer transition-all',
                                getMatrixCellColor(likelihood, impact)
                              )}
                              onClick={() => cellRisks.length > 0 && handleRiskClick(cellRisks[0])}
                            >
                              {cellRisks.map((risk) => {
                                const score = getRiskScore(risk.likelihood, risk.impact)
                                return (
                                  <div
                                    key={risk.id}
                                    className={cn(
                                      'w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold cursor-pointer',
                                      getRiskDotColor(score)
                                    )}
                                    title={risk.name}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRiskClick(risk)
                                    }}
                                  >
                                    {risk.id.split('-')[1]}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Risk List */}
        <div className="col-span-5">
          <Card className="h-full">
            <CardHeader>
              <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                <CardTitle className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Icon icon="lucide:list" className="text-slate-400" />
                  {t('riskRegister.riskItems')}
                </CardTitle>
                <span className="text-sm text-slate-500">{filteredRisks.length} {t('riskRegister.risks')}</span>
              </div>
              {/* Filters */}
              <div className={`flex gap-3 mt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <input
                  type="text"
                  placeholder={t('riskRegister.search')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as RiskCategory | 'all')}
                  className={`px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                >
                  <option value="all">{t('riskRegister.allCategories')}</option>
                  {Object.entries(categoryConfig).map(([key]) => (
                    <option key={key} value={key}>{categoryLabels[key as RiskCategory]}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as RiskStatus | 'all')}
                  className={`px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
                >
                  <option value="all">{t('riskRegister.allStatus')}</option>
                  {Object.entries(statusConfig).map(([key]) => (
                    <option key={key} value={key}>{statusLabels[key as RiskStatus]}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[500px] overflow-y-auto hide-scrollbar">
                {filteredRisks.map((risk) => {
                  const score = getRiskScore(risk.likelihood, risk.impact)
                  const level = getRiskLevel(score)
                  return (
                    <div
                      key={risk.id}
                      onClick={() => handleRiskClick(risk)}
                      className="p-4 border border-slate-200 rounded-xl hover:border-emerald-300 hover:shadow-sm cursor-pointer transition-all"
                    >
                      <div className={`flex items-start justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : ''}`}>
                          <div className={`flex items-center gap-2 mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-mono text-slate-400">{risk.id}</span>
                            <Badge className={statusConfig[risk.status].color}>
                              {statusLabels[risk.status]}
                            </Badge>
                          </div>
                          <p className="font-semibold text-slate-900 truncate">{risk.name}</p>
                          <div className={`flex items-center gap-3 mt-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <Badge className={categoryConfig[risk.category].color}>
                              <Icon icon={categoryConfig[risk.category].icon} className={`w-3 h-3 ${isRTL ? 'ml-1' : 'mr-1'}`} />
                              {categoryLabels[risk.category]}
                            </Badge>
                            <span className={cn('text-xs font-bold', level.color)}>
                              {t('riskRegister.score')}: {score}
                            </span>
                          </div>
                        </div>
                        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm', level.bgColor)}>
                          {score}
                        </div>
                      </div>
                      {risk.status === 'mitigating' && (
                        <div className="mt-3">
                          <div className={`flex items-center justify-between text-xs text-slate-500 mb-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                            <span>{t('riskRegister.mitigationProgress')}</span>
                            <span>{risk.mitigationProgress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-emerald-500 rounded-full transition-all ${isRTL ? 'mr-auto' : ''}`}
                              style={{ width: `${risk.mitigationProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Risk Detail Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={t('riskRegister.riskDetails')}
        size="lg"
      >
        {selectedRisk && (
          <div className="space-y-6">
            {/* Header */}
            <div className={isRTL ? 'text-right' : ''}>
              <div className={`flex items-center gap-2 mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <span className="text-sm font-mono text-slate-400">{selectedRisk.id}</span>
                <Badge className={statusConfig[selectedRisk.status].color}>
                  {statusLabels[selectedRisk.status]}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-slate-900">{selectedRisk.name}</h2>
              <p className="text-slate-500 mt-2">{selectedRisk.description}</p>
            </div>

            {/* Risk Score */}
            <div className="bg-slate-50 p-4 rounded-xl">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('riskRegister.likelihood')}</p>
                  <p className="text-lg font-bold text-slate-900">{selectedRisk.likelihood}</p>
                  <p className="text-xs text-slate-400">{translatedLikelihoodLabels[selectedRisk.likelihood - 1]}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('riskRegister.impact')}</p>
                  <p className="text-lg font-bold text-slate-900">{selectedRisk.impact}</p>
                  <p className="text-xs text-slate-400">{translatedImpactLabels[selectedRisk.impact - 1]}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('riskRegister.riskScore')}</p>
                  <p className={cn('text-2xl font-bold', getRiskLevel(getRiskScore(selectedRisk.likelihood, selectedRisk.impact)).color)}>
                    {getRiskScore(selectedRisk.likelihood, selectedRisk.impact)}
                  </p>
                  <p className="text-xs text-slate-400">{getRiskLevel(getRiskScore(selectedRisk.likelihood, selectedRisk.impact)).label}</p>
                </div>
              </div>
            </div>

            {/* Category & Owner */}
            <div className="grid grid-cols-2 gap-4">
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs text-slate-500 mb-2">{t('riskRegister.category')}</p>
                <Badge className={cn('px-3 py-1.5', categoryConfig[selectedRisk.category].color)}>
                  <Icon icon={categoryConfig[selectedRisk.category].icon} className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} />
                  {categoryLabels[selectedRisk.category]}
                </Badge>
              </div>
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs text-slate-500 mb-2">{t('riskRegister.riskOwner')}</p>
                <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <img
                    src={selectedRisk.owner.avatar}
                    alt={selectedRisk.owner.name}
                    className="w-8 h-8 rounded-full"
                  />
                  <div className={isRTL ? 'text-right' : ''}>
                    <p className="text-sm font-semibold text-slate-900">{selectedRisk.owner.name}</p>
                    <p className="text-xs text-slate-500">{selectedRisk.owner.department}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Mitigation Plan */}
            {selectedRisk.mitigationPlan && (
              <div className={isRTL ? 'text-right' : ''}>
                <p className="text-xs text-slate-500 mb-2">{t('riskRegister.mitigationPlan')}</p>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-sm text-slate-700">{selectedRisk.mitigationPlan}</p>
                  {selectedRisk.status === 'mitigating' && (
                    <div className="mt-4">
                      <div className={`flex items-center justify-between text-xs text-slate-500 mb-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <span>{t('riskRegister.progress')}</span>
                        <span className="font-semibold text-emerald-600">{selectedRisk.mitigationProgress}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-emerald-500 rounded-full transition-all ${isRTL ? 'mr-auto' : ''}`}
                          style={{ width: `${selectedRisk.mitigationProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className={`flex gap-3 pt-4 border-t border-slate-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Button variant="outline" className="flex-1">
                <Icon icon="lucide:edit" className="w-4 h-4" />
                {t('riskRegister.editRisk')}
              </Button>
              <Button variant="outline" className="flex-1">
                <Icon icon="lucide:history" className="w-4 h-4" />
                {t('riskRegister.viewHistory')}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Add Risk Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('riskRegister.addNewRisk')}
        size="lg"
      >
        <div className="space-y-4">
          <div className={isRTL ? 'text-right' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.riskName')}</label>
            <input
              type="text"
              placeholder={t('riskRegister.enterRiskName')}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.description')}</label>
            <textarea
              placeholder={t('riskRegister.describeRisk')}
              rows={3}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={isRTL ? 'text-right' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.category')}</label>
              <select className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}>
                {Object.entries(categoryConfig).map(([key]) => (
                  <option key={key} value={key}>{categoryLabels[key as RiskCategory]}</option>
                ))}
              </select>
            </div>
            <div className={isRTL ? 'text-right' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.riskOwner')}</label>
              <select className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}>
                <option>Sarah Chen</option>
                <option>Ahmed Al-Rashid</option>
                <option>Maria Lopez</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className={isRTL ? 'text-right' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.likelihood15')}</label>
              <select className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} - {translatedLikelihoodLabels[n - 1]}</option>
                ))}
              </select>
            </div>
            <div className={isRTL ? 'text-right' : ''}>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.impact15')}</label>
              <select className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isRTL ? 'text-right' : ''}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} - {translatedImpactLabels[n - 1]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className={isRTL ? 'text-right' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('riskRegister.mitigationPlan')}</label>
            <textarea
              placeholder={t('riskRegister.describeMitigation')}
              rows={2}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${isRTL ? 'text-right' : ''}`}
            />
          </div>
          <div className={`flex gap-3 pt-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button onClick={() => setIsAddModalOpen(false)} className="flex-1">
              {t('riskRegister.addRisk')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
