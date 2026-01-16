'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { Modal } from '@/components/ui/modal'
import { Observation, severityConfig } from './observation-types'

interface ObservationDetailModalProps {
  observation: Observation | null
  isOpen: boolean
  onClose: () => void
}

export function ObservationDetailModal({
  observation,
  isOpen,
  onClose,
}: ObservationDetailModalProps) {
  const [updateText, setUpdateText] = useState('')

  if (!observation) return null

  const severity = severityConfig[observation.severity]
  const completedTasks = observation.checklist?.filter((item) => item.completed).length ?? 0
  const totalTasks = observation.checklist?.length ?? 0
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <div className="flex flex-col lg:flex-row h-[80vh] -m-6">
        {/* Main Section */}
        <div className="flex-1 p-8 overflow-y-auto bg-white">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all text-slate-400"
            >
              <Icon icon="lucide:arrow-left" className="text-xl" />
            </button>
            <h2 className="text-2xl font-bold font-display text-slate-900">
              {observation.title}
            </h2>
          </div>

          <div className="space-y-8">
            {/* Finding Overview */}
            <section>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-3">
                Finding Overview
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {observation.description}
              </p>
            </section>

            {/* Remediation Checklist */}
            {observation.checklist && observation.checklist.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest">
                    Remediation Checklist
                  </h3>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {progressPercent}% Complete
                  </span>
                </div>
                <div className="space-y-3">
                  {observation.checklist.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded-xl ${
                        item.completed
                          ? 'border-emerald-100 bg-emerald-50/30'
                          : 'border-slate-200'
                      }`}
                    >
                      {item.completed ? (
                        <Icon
                          icon="lucide:check-circle-2"
                          className="text-emerald-500 text-xl"
                        />
                      ) : (
                        <div className="w-5 h-5 border-2 border-slate-300 rounded-full" />
                      )}
                      <span className="text-sm font-medium text-slate-700">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Updates & Discussion */}
            <section>
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4">
                Updates & Discussion
              </h3>
              <div className="space-y-4">
                {observation.updates?.map((update) => (
                  <div key={update.id} className="flex gap-3">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${update.author.avatar}`}
                      className="w-8 h-8 rounded-full shrink-0"
                      alt={update.author.name}
                    />
                    <div className="bg-slate-50 p-4 rounded-2xl rounded-tl-none flex-1">
                      <p className="text-xs font-bold text-slate-900">
                        {update.author.name}{' '}
                        <span className="font-normal text-slate-400 ml-2">
                          {update.createdAt}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600 mt-1">{update.text}</p>
                    </div>
                  </div>
                ))}
                <div className="relative flex items-center">
                  <input
                    type="text"
                    placeholder="Write an update..."
                    value={updateText}
                    onChange={(e) => setUpdateText(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
                  />
                  <button className="absolute right-3 text-emerald-600 hover:text-emerald-700 transition-colors">
                    <Icon icon="lucide:send-horizontal" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="w-full lg:w-80 bg-slate-50 border-t lg:border-t-0 lg:border-l border-slate-200 p-8 space-y-8 shrink-0 overflow-y-auto">
          {/* Severity */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
              Severity
            </h4>
            <span
              className={`px-4 py-2 ${
                observation.severity === 'critical'
                  ? 'bg-rose-500'
                  : observation.severity === 'high'
                  ? 'bg-orange-500'
                  : observation.severity === 'medium'
                  ? 'bg-amber-500'
                  : 'bg-slate-500'
              } text-white text-xs font-black rounded-lg uppercase block text-center`}
            >
              {severity.label}
            </span>
          </div>

          {/* Deadline Countdown */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-2">
              Deadline Countdown
            </h4>
            <div className="flex items-center gap-2 text-rose-600 font-bold">
              <Icon icon="lucide:alarm-clock" />
              <span>04 Days Remaining</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: '85%' }} />
            </div>
          </div>

          {/* Assigned Team */}
          {observation.team && observation.team.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
                Assigned Team
              </h4>
              <div className="space-y-3">
                {observation.team.map((member, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <img
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.avatar}`}
                      className="w-8 h-8 rounded-full"
                      alt={member.name}
                    />
                    <div className="text-[10px]">
                      <p className="font-bold text-slate-900">{member.name}</p>
                      <p className="text-slate-500 uppercase font-black">{member.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Documents */}
          {observation.documents && observation.documents.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
                Related Documents
              </h4>
              <div className="space-y-2">
                {observation.documents.map((doc) => (
                  <a
                    key={doc.id}
                    href="#"
                    className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 transition-all"
                  >
                    <Icon
                      icon={doc.type === 'pdf' ? 'lucide:file-text' : 'lucide:image'}
                      className={doc.type === 'pdf' ? 'text-emerald-500' : 'text-blue-500'}
                    />
                    <span className="text-[10px] font-bold text-slate-700 truncate">
                      {doc.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          {observation.timeline && observation.timeline.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase text-slate-500 tracking-widest mb-4">
                Activity Timeline
              </h4>
              <div className="space-y-4 border-l-2 border-slate-200 ml-2 pl-4">
                {observation.timeline.map((event, index) => (
                  <div key={event.id} className="relative">
                    <div
                      className={`absolute -left-[21px] top-1 w-2 h-2 rounded-full ${
                        index === 0 ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    <p className="text-[10px] font-black text-slate-400 uppercase">
                      {event.date}
                    </p>
                    <p className="text-xs font-medium text-slate-700">
                      {event.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
