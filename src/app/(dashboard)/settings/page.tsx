'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Header } from '@/components/layout/header'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'audit'>('general')
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)

  return (
    <>
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="text-xl font-bold font-display text-slate-900">Governance & Compliance</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">
              Saudi National Regulatory Standards
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === 'general'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === 'security'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('security')}
            >
              Security
            </button>
            <button
              className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${
                activeTab === 'audit'
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              onClick={() => setActiveTab('audit')}
            >
              Audit Logs
            </button>
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

      <div className="flex-1 overflow-auto custom-scrollbar p-8">
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
              <button className="text-sm font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
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
              />
              <FrameworkCard
                icon="lucide:landmark"
                iconColor="indigo"
                title="SAMA CSF"
                description="Saudi Central Bank Cyber Security Framework for financial entities."
                isActive={true}
              />
              <FrameworkCard
                icon="lucide:user-check"
                iconColor="amber"
                title="NDMO PDPL"
                description="Personal Data Protection Law by the National Data Management Office."
                isActive={false}
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
                <IntegrationCard name="Jira" icon="logos:jira" connected={true} />
                <IntegrationCard name="Drive" icon="logos:google-drive" connected={true} />
                <IntegrationCard name="Slack" icon="logos:slack-icon" connected={false} />
                <IntegrationCard name="GitHub" icon="logos:github-icon" connected={false} />
              </div>
              <button className="w-full mt-6 py-3 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition-all">
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
              <Button variant="dark">
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
                  />
                  <TemplateRow
                    name="PDPL Data Mapping Review"
                    category="Legal/Privacy"
                    lastModified="Sep 28, 2024"
                    usage={22}
                  />
                  <TemplateRow
                    name="SAMA Quarterly Report"
                    category="Financial Compliance"
                    lastModified="Oct 05, 2024"
                    usage={88}
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
              <button className="absolute bottom-0 right-0 bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-full shadow-lg transition-all duration-200">
                <Icon icon="lucide:camera" className="text-lg" />
              </button>
            </div>
            <button className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors">
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
}: {
  icon: string
  iconColor: 'blue' | 'indigo' | 'amber'
  title: string
  description: string
  isActive: boolean
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
          className={`w-9 h-5 rounded-full relative transition-colors ${
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
        <button className={`text-xs font-bold ${active ? 'text-slate-400 hover:text-slate-900' : 'text-emerald-600'}`}>
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
        className={`w-9 h-5 rounded-full relative transition-colors ${
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
}: {
  name: string
  icon: string
  connected: boolean
}) {
  return (
    <div
      className={`p-4 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between ${
        !connected && 'opacity-50'
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
}: {
  name: string
  category: string
  lastModified: string
  usage: number
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
        <button className="text-slate-400 hover:text-emerald-600 transition-colors">
          <Icon icon="lucide:edit-3" />
        </button>
      </td>
    </tr>
  )
}
