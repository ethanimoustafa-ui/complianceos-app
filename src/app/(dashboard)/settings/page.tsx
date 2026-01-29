'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { useTranslation, TranslationKey, InterpolationParams } from '@/i18n'
import { RoleGuard } from '@/components/auth/role-guard'

export default function SettingsPage() {
  const { t, language, setLanguage, isRTL } = useTranslation()

  // Profile modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  // Add Standard modal
  const [isAddStandardModalOpen, setIsAddStandardModalOpen] = useState(false)

  // Marketplace modal
  const [isMarketplaceModalOpen, setIsMarketplaceModalOpen] = useState(false)

  // New Template modal
  const [isNewTemplateModalOpen, setIsNewTemplateModalOpen] = useState(false)

  // Configure Framework modal
  const [isConfigureFrameworkModalOpen, setIsConfigureFrameworkModalOpen] = useState(false)
  const [selectedFramework, setSelectedFramework] = useState<{ title: string; description: string } | null>(null)

  // Connect Integration modal
  const [isConnectIntegrationModalOpen, setIsConnectIntegrationModalOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<{ name: string; icon: string } | null>(null)

  // Edit Template modal
  const [isEditTemplateModalOpen, setIsEditTemplateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<{ name: string; category: string } | null>(null)

  const handleConfigureFramework = (title: string, description: string) => {
    setSelectedFramework({ title, description })
    setIsConfigureFrameworkModalOpen(true)
  }

  const handleConnectIntegration = (name: string, icon: string) => {
    setSelectedIntegration({ name, icon })
    setIsConnectIntegrationModalOpen(true)
  }

  const handleEditTemplate = (name: string, category: string) => {
    setSelectedTemplate({ name, category })
    setIsEditTemplateModalOpen(true)
  }

  return (
    <>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">{t('settings.title')}</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              {t('settings.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 mr-4 text-slate-400">
            <span className="text-xs font-bold uppercase tracking-widest">{t('common.autoSaveActive')}</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <Button variant="primary" className="shadow-lg shadow-emerald-100">
            <Icon icon="lucide:save" />
            {t('common.saveChanges')}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        <div className="max-w-6xl mx-auto space-y-10">
          {/* Compliance Frameworks Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.complianceFrameworks')}</h2>
                <p className="text-sm text-slate-500">
                  {t('settings.manageFrameworks')}
                </p>
              </div>
              <RoleGuard adminOnly hidden>
                <button
                  onClick={() => setIsAddStandardModalOpen(true)}
                  className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                >
                  <Icon icon="lucide:plus-circle" />
                  {t('settings.addStandard')}
                </button>
              </RoleGuard>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FrameworkCard
                icon="lucide:shield-check"
                iconColor="blue"
                title={t('settings.ncaEcc')}
                description={t('settings.ncaEccDescription')}
                isActive={true}
                onConfigure={handleConfigureFramework}
                t={t}
              />
              <FrameworkCard
                icon="lucide:landmark"
                iconColor="indigo"
                title={t('settings.samaCsf')}
                description={t('settings.samaCsfDescription')}
                isActive={true}
                onConfigure={handleConfigureFramework}
                t={t}
              />
              <FrameworkCard
                icon="lucide:user-check"
                iconColor="amber"
                title={t('settings.ndmoPdpl')}
                description={t('settings.ndmoPdplDescription')}
                isActive={false}
                onConfigure={handleConfigureFramework}
                t={t}
              />
            </div>
          </section>

          {/* Notifications & Integrations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Notifications Section */}
            <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display mb-1">{t('settings.notifications')}</h2>
              <p className="text-sm text-slate-500 mb-6">
                {t('settings.manageAlerts')}
              </p>

              <div className="space-y-6">
                <NotificationToggle
                  icon="lucide:mail"
                  title={t('settings.emailDigests')}
                  description={t('settings.emailDigestsDescription')}
                  defaultOn={true}
                />
                <NotificationToggle
                  icon="lucide:bell"
                  title={t('settings.criticalAlerts')}
                  description={t('settings.criticalAlertsDescription')}
                  defaultOn={true}
                />
                <NotificationToggle
                  icon="lucide:message-square"
                  title={t('settings.slackIntegration')}
                  description={t('settings.slackIntegrationDescription')}
                  defaultOn={false}
                />
              </div>
            </section>

            {/* Connected Apps Section */}
            <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display mb-1">{t('settings.connectedApps')}</h2>
              <p className="text-sm text-slate-500 mb-6">{t('settings.syncData')}</p>

              <div className="grid grid-cols-2 gap-4">
                <IntegrationCard name="Jira" icon="logos:jira" connected={true} onConnect={handleConnectIntegration} />
                <IntegrationCard name="Drive" icon="logos:google-drive" connected={true} onConnect={handleConnectIntegration} />
                <IntegrationCard name="Slack" icon="logos:slack-icon" connected={false} onConnect={handleConnectIntegration} />
                <IntegrationCard name="GitHub" icon="logos:github-icon" connected={false} onConnect={handleConnectIntegration} />
              </div>
              <button
                onClick={() => setIsMarketplaceModalOpen(true)}
                className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all cursor-pointer"
              >
                {t('settings.viewMarketplace')}
              </button>
            </section>
          </div>

          {/* User Preferences Section */}
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.userPreferences')}</h2>
                <p className="text-sm text-slate-500">{t('settings.customizeWorkspace')}</p>
              </div>
              <Button variant="outline" onClick={() => setIsProfileModalOpen(true)}>
                <Icon icon="lucide:user" />
                {t('sidebar.editProfile')}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    {t('settings.defaultDashboardView')}
                  </label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm">
                    <option>{t('settings.executiveOverview')}</option>
                    <option>{t('settings.complianceMatrix')}</option>
                    <option>{t('settings.riskDashboard')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    {t('settings.timeZone')}
                  </label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm">
                    <option>Asia/Riyadh (UTC+3)</option>
                    <option>UTC</option>
                    <option>America/New_York (UTC-5)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    {t('settings.language')}
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as 'en' | 'ar')}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm"
                  >
                    <option value="en">English</option>
                    <option value="ar">العربية</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    {t('settings.dateFormat')}
                  </label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm">
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Audit Templates Section */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">{t('settings.auditTemplates')}</h2>
                <p className="text-sm text-slate-500">{t('settings.standardizeChecks')}</p>
              </div>
              <RoleGuard adminOnly hidden>
                <Button variant="dark" onClick={() => setIsNewTemplateModalOpen(true)}>
                  <Icon icon="lucide:plus" />
                  {t('settings.newTemplate')}
                </Button>
              </RoleGuard>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {t('settings.templateNameCol')}
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {t('settings.categoryCol')}
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {t('settings.lastModifiedCol')}
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {t('settings.usageCol')}
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      {t('settings.actionsCol')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <TemplateRow
                    name="NCA ECC Self-Assessment"
                    category={t('settings.technicalControl')}
                    lastModified="Oct 12, 2024"
                    usage={75}
                    onEdit={handleEditTemplate}
                  />
                  <TemplateRow
                    name="PDPL Data Mapping Review"
                    category={t('settings.legalPrivacy')}
                    lastModified="Sep 28, 2024"
                    usage={22}
                    onEdit={handleEditTemplate}
                  />
                  <TemplateRow
                    name="SAMA Quarterly Report"
                    category={t('settings.financialCompliance')}
                    lastModified="Oct 05, 2024"
                    usage={88}
                    onEdit={handleEditTemplate}
                  />
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* Profile Edit Modal */}
      <Modal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        title={t('settings.profileSettings')}
        size="md"
      >
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 pb-4">
            <div className="relative group">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                alt="User"
                className="w-24 h-24 rounded-full border-4 border-slate-200 group-hover:border-emerald-400 transition-all duration-200"
              />
              <button className="absolute bottom-0 right-0 bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-full shadow-lg transition-all duration-200 cursor-pointer">
                <Icon icon="lucide:camera" className="text-lg" />
              </button>
            </div>
            <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer">
              {t('sidebar.changeAvatar')}
            </button>
          </div>
          <Input label={t('sidebar.fullName')} defaultValue="Felix Anderson" />
          <Input label={t('sidebar.emailAddress')} type="email" defaultValue="felix@complianceos.io" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('sidebar.role')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.complianceManager')}</option>
              <option>{t('settings.auditor')}</option>
              <option>{t('settings.administrator')}</option>
            </select>
          </div>
          <Input label={t('sidebar.department')} defaultValue="Risk & Compliance" />
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsProfileModalOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsProfileModalOpen(false)}>
              {t('common.saveChanges')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Standard Modal */}
      <Modal
        isOpen={isAddStandardModalOpen}
        onClose={() => setIsAddStandardModalOpen(false)}
        title={t('settings.addComplianceStandard')}
        subtitle={t('settings.addNewFramework')}
        size="md"
      >
        <div className="space-y-4">
          <Input label={t('settings.frameworkName')} placeholder={t('settings.frameworkNamePlaceholder')} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.frameworkType')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.ncaFramework')}</option>
              <option>{t('settings.samaFramework')}</option>
              <option>{t('settings.ndmoFramework')}</option>
              <option>{t('settings.internationalStandard')}</option>
              <option>{t('settings.customFramework')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('audits.description')}</label>
            <textarea
              rows={3}
              placeholder={t('settings.briefDescription')}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">{t('settings.autoSyncControls')}</p>
              <p className="text-xs text-slate-500">{t('settings.autoSyncDescription')}</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsAddStandardModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsAddStandardModalOpen(false)}>
              <Icon icon="lucide:plus" />
              {t('settings.addStandard')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Marketplace Modal */}
      <Modal
        isOpen={isMarketplaceModalOpen}
        onClose={() => setIsMarketplaceModalOpen(false)}
        title={t('settings.integrationMarketplace')}
        subtitle={t('settings.connectFavoriteTools')}
        size="lg"
      >
        <div className="space-y-6">
          <div className="relative">
            <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t('settings.searchIntegrations')}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{t('settings.communication')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="Slack" icon="logos:slack-icon" description={t('settings.realTimeNotifications')} />
              <MarketplaceItem name="Microsoft Teams" icon="logos:microsoft-teams" description={t('settings.teamCollaboration')} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{t('settings.storage')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="Google Drive" icon="logos:google-drive" description={t('settings.documentStorage')} />
              <MarketplaceItem name="Dropbox" icon="logos:dropbox" description={t('settings.fileSync')} />
              <MarketplaceItem name="OneDrive" icon="logos:microsoft-onedrive" description={t('settings.cloudStorage')} />
              <MarketplaceItem name="Box" icon="logos:box" description={t('settings.enterpriseContent')} />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">{t('settings.development')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="GitHub" icon="logos:github-icon" description={t('settings.codeRepository')} />
              <MarketplaceItem name="GitLab" icon="logos:gitlab" description={t('settings.devOpsPlatform')} />
              <MarketplaceItem name="Jira" icon="logos:jira" description={t('settings.issueTracking')} />
              <MarketplaceItem name="Confluence" icon="logos:confluence" description={t('settings.documentation')} />
            </div>
          </div>
        </div>
      </Modal>

      {/* New Template Modal */}
      <Modal
        isOpen={isNewTemplateModalOpen}
        onClose={() => setIsNewTemplateModalOpen(false)}
        title={t('settings.createNewTemplate')}
        subtitle={t('settings.buildReusableTemplate')}
        size="md"
      >
        <div className="space-y-4">
          <Input label={t('settings.templateNameLabel')} placeholder={t('settings.templateNamePlaceholder')} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.technicalControl')}</option>
              <option>{t('settings.legalPrivacy')}</option>
              <option>{t('settings.financialCompliance')}</option>
              <option>{t('settings.operational')}</option>
              <option>{t('settings.custom')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.associatedFramework')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.ncaEcc')}</option>
              <option>{t('settings.samaCsf')}</option>
              <option>{t('settings.ndmoPdpl')}</option>
              <option>{t('settings.multipleFrameworks')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('audits.description')}</label>
            <textarea
              rows={3}
              placeholder={t('settings.describePurposeScope')}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsNewTemplateModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsNewTemplateModalOpen(false)}>
              <Icon icon="lucide:plus" />
              {t('settings.newTemplate')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Configure Framework Modal */}
      <Modal
        isOpen={isConfigureFrameworkModalOpen}
        onClose={() => setIsConfigureFrameworkModalOpen(false)}
        title={`${t('settings.configureFramework')} ${selectedFramework?.title || ''}`}
        subtitle={t('settings.adjustFrameworkSettings')}
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-sm text-slate-600">{selectedFramework?.description}</p>
          </div>

          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">{t('settings.frameworkStatus')}</p>
              <p className="text-xs text-slate-500">{t('settings.enableDisableFramework')}</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.syncFrequency')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.realTime')}</option>
              <option>{t('settings.hourly')}</option>
              <option>{t('settings.daily')}</option>
              <option>{t('settings.weekly')}</option>
              <option>{t('settings.manual')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.complianceThreshold')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.strict90')}</option>
              <option>{t('settings.standard80')}</option>
              <option>{t('settings.relaxed70')}</option>
              <option>{t('settings.custom')}</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">{t('settings.alertOnNonCompliance')}</p>
              <p className="text-xs text-slate-500">{t('settings.alertDescription')}</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsConfigureFrameworkModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsConfigureFrameworkModalOpen(false)}>
              {t('settings.saveSettings')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Connect Integration Modal */}
      <Modal
        isOpen={isConnectIntegrationModalOpen}
        onClose={() => setIsConnectIntegrationModalOpen(false)}
        title={`${t('settings.connectIntegration')} ${selectedIntegration?.name || ''}`}
        subtitle={t('settings.authorizeAccess')}
        size="md"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-center p-8 bg-slate-50 rounded-xl">
            {selectedIntegration && (
              <Icon icon={selectedIntegration.icon} className="text-6xl" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.connectionMethod')}</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>{t('settings.oauth2Recommended')}</option>
              <option>{t('settings.apiKey')}</option>
              <option>{t('settings.personalAccessToken')}</option>
            </select>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">{t('settings.permissionsRequired')}</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" defaultChecked className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('settings.readAccess')}</p>
                  <p className="text-xs text-slate-500">{t('settings.readAccessDescription')}</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" defaultChecked className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('settings.writeAccess')}</p>
                  <p className="text-xs text-slate-500">{t('settings.writeAccessDescription')}</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('settings.adminAccess')}</p>
                  <p className="text-xs text-slate-500">{t('settings.adminAccessDescription')}</p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsConnectIntegrationModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsConnectIntegrationModalOpen(false)}>
              <Icon icon="lucide:link" />
              {t('settings.connect')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Template Modal */}
      <Modal
        isOpen={isEditTemplateModalOpen}
        onClose={() => setIsEditTemplateModalOpen(false)}
        title={t('settings.editTemplate')}
        subtitle={selectedTemplate?.name}
        size="md"
      >
        <div className="space-y-4">
          <Input label={t('settings.templateNameLabel')} defaultValue={selectedTemplate?.name} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('settings.categoryCol')}</label>
            <select
              defaultValue={selectedTemplate?.category}
              className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option>{t('settings.technicalControl')}</option>
              <option>{t('settings.legalPrivacy')}</option>
              <option>{t('settings.financialCompliance')}</option>
              <option>{t('settings.operational')}</option>
            </select>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('settings.lastModifiedCol')}</span>
              <span className="font-medium text-slate-900">Oct 12, 2024</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('settings.createdBy')}</span>
              <span className="font-medium text-slate-900">Felix Anderson</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('settings.timesUsedLabel')}</span>
              <span className="font-medium text-slate-900">24 {t('settings.audits')}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('audits.description')}</label>
            <textarea
              rows={3}
              defaultValue={t('settings.standardDescription')}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsEditTemplateModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <RoleGuard deleteOnly hidden>
              <button
                onClick={() => setIsEditTemplateModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              >
                {t('settings.deleteTemplate')}
              </button>
            </RoleGuard>
            <Button variant="primary" className="flex-1" onClick={() => setIsEditTemplateModalOpen(false)}>
              {t('common.saveChanges')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

// Component definitions
function FrameworkCard({
  icon,
  iconColor,
  title,
  description,
  isActive,
  onConfigure,
  t,
}: {
  icon: string
  iconColor: 'blue' | 'indigo' | 'amber'
  title: string
  description: string
  isActive: boolean
  onConfigure: (title: string, description: string) => void
  t: (key: TranslationKey, params?: InterpolationParams) => string
}) {
  const [active, setActive] = useState(isActive)

  const iconColors = {
    blue: 'bg-blue-50 text-blue-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    amber: 'bg-amber-50 text-amber-600',
  }

  return (
    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm hover:border-emerald-500 hover:-translate-y-0.5 transition-all cursor-pointer">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 ${iconColors[iconColor]} rounded-xl`}>
          <Icon icon={icon} className="text-2xl" />
        </div>
        <button
          className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
            active ? 'bg-emerald-500' : 'bg-slate-200'
          }`}
          onClick={() => setActive(!active)}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              active ? 'left-4' : 'left-0.5'
            }`}
          />
        </button>
      </div>
      <h3 className="font-bold text-slate-900">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 mb-4">{description}</p>
      <div className="flex items-center justify-between pt-4 border-t border-slate-50">
        <span className={`text-[10px] font-black ${active ? 'text-emerald-600' : 'text-slate-400'}`}>
          {active ? t('common.active') : t('settings.disabled')}
        </span>
        <RoleGuard adminOnly hidden>
          <button
            onClick={() => onConfigure(title, description)}
            className={`text-xs font-bold cursor-pointer ${active ? 'text-slate-400 hover:text-slate-900' : 'text-emerald-600'}`}
          >
            {active ? t('settings.configure') : t('settings.enableNow')} &rarr;
          </button>
        </RoleGuard>
      </div>
    </div>
  )
}

function NotificationToggle({
  icon,
  title,
  description,
  defaultOn,
}: {
  icon: string
  title: string
  description: string
  defaultOn: boolean
}) {
  const [isOn, setIsOn] = useState(defaultOn)

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Icon icon={icon} className="text-xl text-slate-400" />
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <button
        className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
          isOn ? 'bg-emerald-500' : 'bg-slate-200'
        }`}
        onClick={() => setIsOn(!isOn)}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            isOn ? 'left-4' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function IntegrationCard({
  name,
  icon,
  connected,
  onConnect,
}: {
  name: string
  icon: string
  connected: boolean
  onConnect: (name: string, icon: string) => void
}) {
  return (
    <div
      onClick={() => !connected && onConnect(name, icon)}
      className={`p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between ${
        !connected && 'opacity-50 cursor-pointer hover:opacity-75 hover:border-emerald-200 transition-all'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon icon={icon} className="text-xl" />
        <span className="text-xs font-bold">{name}</span>
      </div>
      {connected ? (
        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
      ) : (
        <Icon icon="lucide:plus" className="text-slate-400" />
      )}
    </div>
  )
}

function TemplateRow({
  name,
  category,
  lastModified,
  usage,
  onEdit,
}: {
  name: string
  category: string
  lastModified: string
  usage: number
  onEdit: (name: string, category: string) => void
}) {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      <td className="px-8 py-4">
        <div className="flex items-center gap-3">
          <Icon icon="lucide:file-check" className="text-emerald-500" />
          <span className="text-sm font-bold text-slate-700">{name}</span>
        </div>
      </td>
      <td className="px-8 py-4 text-xs font-medium text-slate-500">{category}</td>
      <td className="px-8 py-4 text-xs text-slate-500">{lastModified}</td>
      <td className="px-8 py-4">
        <div className="flex items-center gap-2">
          <div className="w-12 h-1.5 bg-slate-100 rounded-full">
            <div
              className="h-full bg-slate-900 rounded-full"
              style={{ width: `${usage}%` }}
            ></div>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{usage}%</span>
        </div>
      </td>
      <td className="px-8 py-4 text-right">
        <RoleGuard editOnly hidden>
          <button
            onClick={() => onEdit(name, category)}
            className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
          >
            <Icon icon="lucide:edit-3" />
          </button>
        </RoleGuard>
      </td>
    </tr>
  )
}

function MarketplaceItem({
  name,
  icon,
  description,
}: {
  name: string
  icon: string
  description: string
}) {
  return (
    <div className="p-4 border border-slate-200 rounded-xl hover:border-emerald-400 hover:shadow-sm transition-all cursor-pointer group">
      <div className="flex items-center gap-3 mb-2">
        <Icon icon={icon} className="text-2xl" />
        <span className="text-sm font-bold text-slate-900">{name}</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">{description}</p>
      <button className="text-xs font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
        Connect &rarr;
      </button>
    </div>
  )
}
