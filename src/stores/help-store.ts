// Help store — Phase 5 review.
//
// **KEPT PERSISTED (client-only) by design.** Pure UI state for the help-tour
// articles + recently-viewed list. The article catalog is hard-coded copy
// that ships with the bundle (no editorial workflow, no backend search), and
// the recently-viewed list is per-device. No server endpoint applies.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { HelpArticle } from '@/types'

const SEED_ARTICLES: HelpArticle[] = [
  { id: 'help-1', title: 'Getting Started with ComplianceOS', summary: 'Learn the basics of navigating the platform and setting up your workspace.', category: 'Getting Started', content: 'ComplianceOS is your centralized platform for managing regulatory compliance. Start by reviewing your dashboard, which provides real-time health scores across all frameworks. Navigate using the sidebar to access Calendar, Correspondence, Reports, Team management, and Settings. Each section is designed to streamline your compliance workflow from observation tracking to SAMA letter management.', icon: 'lucide:rocket' },
  { id: 'help-2', title: 'Understanding the Dashboard', summary: 'Executive, managerial, and officer views explained.', category: 'Getting Started', content: 'The dashboard offers three views: Executive (high-level health scores and trends), Managerial (departmental breakdowns and action items), and Officer (detailed task lists and deadlines). Switch between views using the toggle in the top-right corner. Each view aggregates data from all compliance stores to provide real-time insights.', icon: 'lucide:layout-grid' },
  { id: 'help-3', title: 'Using the Calendar', summary: 'Track deadlines, reviews, and submissions across all compliance areas.', category: 'Calendar', content: 'The Calendar aggregates events from 9 data sources: audits, observations, policies, SAMA letters, circulars, training, correspondence, advisories, and risks. Events are color-coded by source type. Click any event to navigate directly to the source entity. Use filters to focus on specific compliance areas. The calendar supports month, week, and agenda views.', icon: 'lucide:calendar' },
  { id: 'help-4', title: 'Generating Reports', summary: 'Create compliance, audit, and risk reports with one click.', category: 'Reports', content: 'Navigate to Reports to access pre-built report templates for compliance health, audit findings, risk assessments, and SAMA submissions. Reports can be exported in PDF, Excel, and CSV formats. The compliance engine calculates scores based on framework weights configured in Settings. Use the executive summary tab for board-ready reports.', icon: 'lucide:file-text' },
  { id: 'help-5', title: 'Managing Observations', summary: 'Track, assign, and remediate audit observations.', category: 'Compliance', content: 'Observations can be created from SAMA audits, internal audits, or Sharia reviews. Each observation tracks severity, status, remediation plans, and closure workflows. Assign team members, set due dates, and monitor progress through the checklist system. The timeline tab provides a complete audit trail of all changes.', icon: 'lucide:eye' },
  { id: 'help-6', title: 'Policy Lifecycle Management', summary: 'Create, review, approve, and track policies end-to-end.', category: 'Compliance', content: 'Policies follow a structured lifecycle: Draft → Under Review → Approved → Requires Review. Set up review schedules with automatic reminders. The workflow system supports multi-tier approvals (Board, Management, Sharia, AGM). Attach evidence documents and track version history. Use policy templates from Settings to standardize creation.', icon: 'lucide:file-check' },
  { id: 'help-7', title: 'SAMA Letters & Correspondence', summary: 'Draft, approve, and track SAMA communications.', category: 'Compliance', content: 'Create SAMA letters using templates for Non-Objection, Inquiry, Submission, and Notification types. Letters go through a 3-step approval chain (Compliance Officer → Department Head → CEO). Track response deadlines and link related observations. The correspondence module also manages external auditor and vendor communications.', icon: 'lucide:mail' },
  { id: 'help-8', title: 'Team & Permissions', summary: 'Manage team members, roles, and access controls.', category: 'Team Management', content: 'Add team members via invitation, assign roles (Officer, Manager, Admin), and configure granular permissions. The directory shows workload distribution and burnout detection. Use the training module to track employee certifications and compliance training progress. Saudization metrics are tracked automatically.', icon: 'lucide:users' },
  { id: 'help-9', title: 'Configuring Frameworks', summary: 'Set up regulatory frameworks, weights, and thresholds.', category: 'Settings', content: 'Navigate to Settings → Frameworks to enable regulatory bodies (SAMA, NCA-ECC, NDMO-PDPL, etc.). Configure compliance weights to control how audits, observations, policies, and other factors contribute to your health score. Set thresholds (Strict, Standard, Relaxed) to define compliance targets. Pin up to 3 frameworks for dashboard visibility.', icon: 'lucide:sliders' },
  { id: 'help-10', title: 'Notification Preferences', summary: 'Customize alerts by module, event type, and scope.', category: 'Settings', content: 'Configure which modules generate notifications (Rules, Policies, Audits, Observations, SAMA Letters, Training). Choose event types (due dates, critical alerts, approval requests, overdue items, status changes) and scope (own items, managed items, all items). Enable email digests for weekly summaries and Slack integration for real-time alerts.', icon: 'lucide:bell' },
]

interface HelpState {
  articles: HelpArticle[]
  recentlyViewed: string[]
  searchArticles: (query: string) => HelpArticle[]
  getByCategory: (category: string) => HelpArticle[]
  getArticle: (id: string) => HelpArticle | undefined
  trackView: (id: string) => void
}

export const useHelpStore = create<HelpState>()(
  persist(
    (set, get) => ({
      articles: SEED_ARTICLES,
      recentlyViewed: [],

      searchArticles: (query: string) => {
        const q = query.toLowerCase()
        return get().articles.filter(a =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
        )
      },

      getByCategory: (category: string) =>
        get().articles.filter(a => a.category === category),

      getArticle: (id: string) =>
        get().articles.find(a => a.id === id),

      trackView: (id: string) => {
        set((state) => ({
          recentlyViewed: [id, ...state.recentlyViewed.filter(v => v !== id)].slice(0, 10),
        }))
      },
    }),
    {
      name: 'help-storage',
      partialize: (state) => ({ recentlyViewed: state.recentlyViewed }),
    }
  )
)
