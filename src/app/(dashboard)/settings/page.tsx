'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

export default function SettingsPage() {
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
            <h1 className="text-xl font-bold font-display text-slate-900">Settings</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              Governance & Compliance Configuration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-4 mr-4 text-slate-400">
            <span className="text-xs font-bold uppercase tracking-widest">Auto-save: Active</span>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <Button variant="primary" className="shadow-lg shadow-emerald-100">
            <Icon icon="lucide:save" />
            Save Changes
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto hide-scrollbar p-8">
        <div className="max-w-6xl mx-auto space-y-10">
          {/* Compliance Frameworks Section */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">Compliance Frameworks</h2>
                <p className="text-sm text-slate-500">
                  Manage NCA, SAMA, and NDMO regulatory frameworks for your entity.
                </p>
              </div>
              <button
                onClick={() => setIsAddStandardModalOpen(true)}
                className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
              >
                <Icon icon="lucide:plus-circle" />
                Add Standard
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <FrameworkCard
                icon="lucide:shield-check"
                iconColor="blue"
                title="NCA ECC-1:2018"
                description="Essential Cybersecurity Controls by the National Cybersecurity Authority."
                isActive={true}
                onConfigure={handleConfigureFramework}
              />
              <FrameworkCard
                icon="lucide:landmark"
                iconColor="indigo"
                title="SAMA CSF"
                description="Saudi Central Bank Cyber Security Framework for financial entities."
                isActive={true}
                onConfigure={handleConfigureFramework}
              />
              <FrameworkCard
                icon="lucide:user-check"
                iconColor="amber"
                title="NDMO PDPL"
                description="Personal Data Protection Law by the National Data Management Office."
                isActive={false}
                onConfigure={handleConfigureFramework}
              />
            </div>
          </section>

          {/* Notifications & Integrations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Notifications Section */}
            <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display mb-1">Notifications</h2>
              <p className="text-sm text-slate-500 mb-6">
                Manage how you receive alerts and audit updates.
              </p>

              <div className="space-y-6">
                <NotificationToggle
                  icon="lucide:mail"
                  title="Email Digests"
                  description="Weekly summary of audit performance"
                  defaultOn={true}
                />
                <NotificationToggle
                  icon="lucide:bell"
                  title="Critical Alerts"
                  description="Instant push notifications for failures"
                  defaultOn={true}
                />
                <NotificationToggle
                  icon="lucide:message-square"
                  title="Slack Integration"
                  description="Real-time activity in #compliance-feed"
                  defaultOn={false}
                />
              </div>
            </section>

            {/* Connected Apps Section */}
            <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 font-display mb-1">Connected Apps</h2>
              <p className="text-sm text-slate-500 mb-6">Sync data across your enterprise stack.</p>

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
                View Marketplace
              </button>
            </section>
          </div>

          {/* User Preferences Section */}
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 font-display">User Preferences</h2>
                <p className="text-sm text-slate-500">Customize your workspace settings.</p>
              </div>
              <Button variant="outline" onClick={() => setIsProfileModalOpen(true)}>
                <Icon icon="lucide:user" />
                Edit Profile
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    Default Dashboard View
                  </label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm">
                    <option>Executive Overview</option>
                    <option>Compliance Matrix</option>
                    <option>Risk Dashboard</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    Time Zone
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
                    Language
                  </label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-sm">
                    <option>English</option>
                    <option>Arabic</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase mb-2 block">
                    Date Format
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
                <h2 className="text-lg font-bold text-slate-900 font-display">Audit Templates</h2>
                <p className="text-sm text-slate-500">Standardize your compliance checks across teams.</p>
              </div>
              <Button variant="dark" onClick={() => setIsNewTemplateModalOpen(true)}>
                <Icon icon="lucide:plus" />
                New Template
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Template Name
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Category
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Last Modified
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Usage
                    </th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <TemplateRow
                    name="NCA ECC Self-Assessment"
                    category="Technical Control"
                    lastModified="Oct 12, 2024"
                    usage={75}
                    onEdit={handleEditTemplate}
                  />
                  <TemplateRow
                    name="PDPL Data Mapping Review"
                    category="Legal/Privacy"
                    lastModified="Sep 28, 2024"
                    usage={22}
                    onEdit={handleEditTemplate}
                  />
                  <TemplateRow
                    name="SAMA Quarterly Report"
                    category="Financial Compliance"
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
        title="Profile Settings"
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
              Change Avatar
            </button>
          </div>
          <Input label="Full Name" defaultValue="Felix Anderson" />
          <Input label="Email Address" type="email" defaultValue="felix@complianceos.io" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Role</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>Compliance Manager</option>
              <option>Auditor</option>
              <option>Administrator</option>
            </select>
          </div>
          <Input label="Department" defaultValue="Risk & Compliance" />
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsProfileModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsProfileModalOpen(false)}>
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Standard Modal */}
      <Modal
        isOpen={isAddStandardModalOpen}
        onClose={() => setIsAddStandardModalOpen(false)}
        title="Add Compliance Standard"
        subtitle="Add a new regulatory framework to your compliance program"
        size="md"
      >
        <div className="space-y-4">
          <Input label="Framework Name" placeholder="e.g., ISO 27001:2022" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Framework Type</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>NCA Framework</option>
              <option>SAMA Framework</option>
              <option>NDMO Framework</option>
              <option>International Standard</option>
              <option>Custom Framework</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              placeholder="Brief description of the framework..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">Auto-sync Controls</p>
              <p className="text-xs text-slate-500">Automatically update when framework changes</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsAddStandardModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsAddStandardModalOpen(false)}>
              <Icon icon="lucide:plus" />
              Add Standard
            </Button>
          </div>
        </div>
      </Modal>

      {/* View Marketplace Modal */}
      <Modal
        isOpen={isMarketplaceModalOpen}
        onClose={() => setIsMarketplaceModalOpen(false)}
        title="Integration Marketplace"
        subtitle="Connect your favorite tools to ComplianceOS"
        size="lg"
      >
        <div className="space-y-6">
          <div className="relative">
            <Icon icon="lucide:search" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search integrations..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Communication</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="Slack" icon="logos:slack-icon" description="Real-time notifications" />
              <MarketplaceItem name="Microsoft Teams" icon="logos:microsoft-teams" description="Team collaboration" />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Storage</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="Google Drive" icon="logos:google-drive" description="Document storage" />
              <MarketplaceItem name="Dropbox" icon="logos:dropbox" description="File sync" />
              <MarketplaceItem name="OneDrive" icon="logos:microsoft-onedrive" description="Cloud storage" />
              <MarketplaceItem name="Box" icon="logos:box" description="Enterprise content" />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Development</h3>
            <div className="grid grid-cols-2 gap-4">
              <MarketplaceItem name="GitHub" icon="logos:github-icon" description="Code repository" />
              <MarketplaceItem name="GitLab" icon="logos:gitlab" description="DevOps platform" />
              <MarketplaceItem name="Jira" icon="logos:jira" description="Issue tracking" />
              <MarketplaceItem name="Confluence" icon="logos:confluence" description="Documentation" />
            </div>
          </div>
        </div>
      </Modal>

      {/* New Template Modal */}
      <Modal
        isOpen={isNewTemplateModalOpen}
        onClose={() => setIsNewTemplateModalOpen(false)}
        title="Create New Template"
        subtitle="Build a reusable audit template"
        size="md"
      >
        <div className="space-y-4">
          <Input label="Template Name" placeholder="e.g., Monthly Security Review" />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>Technical Control</option>
              <option>Legal/Privacy</option>
              <option>Financial Compliance</option>
              <option>Operational</option>
              <option>Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Associated Framework</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>NCA ECC-1:2018</option>
              <option>SAMA CSF</option>
              <option>NDMO PDPL</option>
              <option>Multiple Frameworks</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              placeholder="Describe the purpose and scope of this template..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsNewTemplateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsNewTemplateModalOpen(false)}>
              <Icon icon="lucide:plus" />
              Create Template
            </Button>
          </div>
        </div>
      </Modal>

      {/* Configure Framework Modal */}
      <Modal
        isOpen={isConfigureFrameworkModalOpen}
        onClose={() => setIsConfigureFrameworkModalOpen(false)}
        title={`Configure ${selectedFramework?.title || 'Framework'}`}
        subtitle="Adjust framework settings and thresholds"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-sm text-slate-600">{selectedFramework?.description}</p>
          </div>

          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">Framework Status</p>
              <p className="text-xs text-slate-500">Enable or disable this framework</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Sync Frequency</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>Real-time</option>
              <option>Hourly</option>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Manual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Compliance Threshold</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>90% (Strict)</option>
              <option>80% (Standard)</option>
              <option>70% (Relaxed)</option>
              <option>Custom</option>
            </select>
          </div>

          <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-slate-900">Alert on Non-Compliance</p>
              <p className="text-xs text-slate-500">Send notifications when threshold is breached</p>
            </div>
            <button className="w-9 h-5 rounded-full relative transition-colors bg-emerald-500 cursor-pointer">
              <span className="absolute top-0.5 left-4 w-4 h-4 bg-white rounded-full shadow" />
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsConfigureFrameworkModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsConfigureFrameworkModalOpen(false)}>
              Save Settings
            </Button>
          </div>
        </div>
      </Modal>

      {/* Connect Integration Modal */}
      <Modal
        isOpen={isConnectIntegrationModalOpen}
        onClose={() => setIsConnectIntegrationModalOpen(false)}
        title={`Connect ${selectedIntegration?.name || 'Integration'}`}
        subtitle="Authorize ComplianceOS to access your account"
        size="md"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-center p-8 bg-slate-50 rounded-xl">
            {selectedIntegration && (
              <Icon icon={selectedIntegration.icon} className="text-6xl" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Connection Method</label>
            <select className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent">
              <option>OAuth 2.0 (Recommended)</option>
              <option>API Key</option>
              <option>Personal Access Token</option>
            </select>
          </div>

          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-3">Permissions Required</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" defaultChecked className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Read Access</p>
                  <p className="text-xs text-slate-500">View data and documents</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" defaultChecked className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Write Access</p>
                  <p className="text-xs text-slate-500">Create and modify data</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
                <input type="checkbox" className="accent-emerald-600 w-4 h-4" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Admin Access</p>
                  <p className="text-xs text-slate-500">Manage workspace settings</p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setIsConnectIntegrationModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setIsConnectIntegrationModalOpen(false)}>
              <Icon icon="lucide:link" />
              Connect
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Template Modal */}
      <Modal
        isOpen={isEditTemplateModalOpen}
        onClose={() => setIsEditTemplateModalOpen(false)}
        title="Edit Template"
        subtitle={selectedTemplate?.name}
        size="md"
      >
        <div className="space-y-4">
          <Input label="Template Name" defaultValue={selectedTemplate?.name} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
            <select
              defaultValue={selectedTemplate?.category}
              className="flex h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option>Technical Control</option>
              <option>Legal/Privacy</option>
              <option>Financial Compliance</option>
              <option>Operational</option>
            </select>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Last Modified</span>
              <span className="font-medium text-slate-900">Oct 12, 2024</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Created By</span>
              <span className="font-medium text-slate-900">Felix Anderson</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Times Used</span>
              <span className="font-medium text-slate-900">24 audits</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
            <textarea
              rows={3}
              defaultValue="Standard self-assessment template for NCA Essential Cybersecurity Controls compliance verification."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsEditTemplateModalOpen(false)}>
              Cancel
            </Button>
            <button
              onClick={() => setIsEditTemplateModalOpen(false)}
              className="px-4 py-2 text-sm font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              Delete Template
            </button>
            <Button variant="primary" className="flex-1" onClick={() => setIsEditTemplateModalOpen(false)}>
              Save Changes
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
}: {
  icon: string
  iconColor: 'blue' | 'indigo' | 'amber'
  title: string
  description: string
  isActive: boolean
  onConfigure: (title: string, description: string) => void
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
          {active ? 'ACTIVE' : 'DISABLED'}
        </span>
        <button
          onClick={() => onConfigure(title, description)}
          className={`text-xs font-bold cursor-pointer ${active ? 'text-slate-400 hover:text-slate-900' : 'text-emerald-600'}`}
        >
          {active ? 'Configure' : 'Enable Now'} &rarr;
        </button>
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
        <button
          onClick={() => onEdit(name, category)}
          className="text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
        >
          <Icon icon="lucide:edit-3" />
        </button>
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
