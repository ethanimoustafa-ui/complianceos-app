# ComplianceOS: Migration Guide to Production-Level Frontend

> **Project Goal:** Present a fully functional frontend demo to the compliance team on **January 30th, 2026** for feature approval. Upon approval, proceed with backend integration and production-ready software development.

This document outlines the steps required to migrate the current static HTML prototype into a production-ready Next.js application.

---

## Project Timeline & Objectives

### Presentation Goal: January 30th, 2026

**Objective:** Demonstrate a polished, interactive frontend with:
- Fully connected navigation (no more isolated HTML files)
- Consistent UI components across all pages
- Working client-side interactions (modals, forms, filters)
- Mock data simulating real compliance workflows

**What This Phase Delivers:**
- A complete frontend application the team can click through
- All features visible and interactive for stakeholder review
- Clear demonstration of the user experience and workflows

**What This Phase Does NOT Include:**
- Real database connections
- Actual authentication/authorization
- Backend API integration
- Production deployment

### Post-Approval Roadmap

Once the compliance team approves the features on January 30th:

| Phase | Focus | Description |
|-------|-------|-------------|
| **Phase A** | Backend Foundation | Set up database (PostgreSQL), API routes, authentication |
| **Phase B** | Data Integration | Connect frontend to real APIs, implement CRUD operations |
| **Phase C** | Security & Compliance | Audit logging, RBAC, data encryption, SAMA compliance |
| **Phase D** | Production Deployment | CI/CD pipeline, staging environment, production launch |

---

## Current State Assessment

| Aspect | Current State | Target State |
|--------|---------------|--------------|
| Framework | Static HTML files | Next.js (App Router) |
| Styling | Tailwind via CDN | Tailwind CSS (properly configured) |
| Components | Duplicated across files | Reusable React components |
| Routing | No routing (separate HTML files) | Next.js file-based routing |
| State Management | None | React Context + Zustand |
| Authentication | UI only (no functionality) | Auth.js |
| Data | Hardcoded in HTML | API-driven with TypeScript types |
| Navigation | Full page reloads | SPA with shared layouts |

### Tech Stack Summary

> **Important:** Always use the latest stable versions of all dependencies. Run `npx create-next-app@latest` to get the most current Next.js and React versions.

| Technology | Purpose |
|------------|---------|
| Next.js | React framework with App Router |
| React | UI library with Server Components |
| TypeScript | Type safety |
| Tailwind CSS | Utility-first styling |
| Auth.js | Authentication |
| Zustand | Client-side state management |
| Zod | Schema validation |
| React Hook Form | Form handling |

---

## Phase 1: Project Setup & Foundation

### 1.1 Initialize Next.js Project

```bash
# Always use @latest to get the most current stable versions
npx create-next-app@latest complianceos --typescript --tailwind --eslint --app --src-dir
```

### 1.2 Install Core Dependencies

```bash
# UI & Styling
npm install @iconify/react clsx tailwind-merge class-variance-authority

# Forms & Validation
npm install react-hook-form zod @hookform/resolvers

# State Management
npm install zustand

# Authentication (for later phases)
npm install next-auth

# Utilities
npm install date-fns
```

### 1.3 Key Features to Leverage

| Feature | Benefit for ComplianceOS |
|---------|--------------------------|
| **React Server Components** | Render dashboard stats on server, reduce client JS bundle |
| **Streaming & Suspense** | Progressive loading for audit reports and large tables |
| **Server Actions** | Form submissions without API routes (post-approval phase) |
| **Parallel Routes** | Load audit details alongside list view |
| **Turbopack** | Faster development iteration |

### 1.4 Configure Tailwind

Extend the default Tailwind configuration with your design tokens:

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
        },
        sidebar: {
          DEFAULT: '#1e293b',
          hover: '#334155',
        }
      },
    },
  },
  plugins: [],
}
export default config
```

### 1.5 Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/
│   │   │   └── page.tsx
│   │   ├── sign-up/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── layout.tsx              # Auth layout (no sidebar)
│   │
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── audits/
│   │   │   ├── page.tsx            # Audit list
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Audit detail
│   │   ├── correspondence/
│   │   │   └── page.tsx
│   │   ├── observations/
│   │   │   └── page.tsx
│   │   ├── risk-register/
│   │   │   └── page.tsx
│   │   ├── sama-letters/
│   │   │   └── page.tsx
│   │   ├── team/
│   │   │   └── page.tsx
│   │   ├── regulatory-updates/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── layout.tsx              # Dashboard layout (with sidebar)
│   │
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Redirect to /dashboard or /sign-in
│   └── globals.css
│
├── components/
│   ├── ui/                         # Base UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── modal.tsx
│   │   ├── dropdown.tsx
│   │   ├── badge.tsx
│   │   ├── progress.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── avatar.tsx
│   │
│   ├── layout/                     # Layout components
│   │   ├── sidebar.tsx
│   │   ├── header.tsx
│   │   ├── nav-item.tsx
│   │   └── user-menu.tsx
│   │
│   ├── dashboard/                  # Dashboard-specific components
│   │   ├── compliance-health-card.tsx
│   │   ├── risk-matrix.tsx
│   │   ├── submissions-tracker.tsx
│   │   ├── team-workload.tsx
│   │   └── stats-card.tsx
│   │
│   ├── audits/                     # Audit-specific components
│   │   ├── audit-card.tsx
│   │   ├── audit-log-entry.tsx
│   │   ├── task-checklist.tsx
│   │   └── audit-filters.tsx
│   │
│   ├── observations/               # Observation components
│   │   ├── observation-table.tsx
│   │   ├── observation-filters.tsx
│   │   └── observation-modal.tsx
│   │
│   └── forms/                      # Form components
│       ├── sign-in-form.tsx
│       ├── sign-up-form.tsx
│       └── profile-form.tsx
│
├── lib/
│   ├── utils.ts                    # Utility functions (cn, formatDate, etc.)
│   └── constants.ts                # App constants
│
├── hooks/
│   ├── use-modal.ts
│   ├── use-sidebar.ts
│   └── use-notifications.ts
│
├── stores/
│   ├── auth-store.ts               # Authentication state
│   ├── notification-store.ts       # Notifications state
│   └── sidebar-store.ts            # Sidebar collapse state
│
└── types/
    ├── audit.ts
    ├── observation.ts
    ├── user.ts
    ├── risk.ts
    └── index.ts
```

---

## Phase 2: Component Extraction

### 2.1 Identify Shared Components

From analyzing the current HTML files, extract these reusable components:

#### High Priority (Used Everywhere)
| Component | Source Files | Instances |
|-----------|--------------|-----------|
| Sidebar | All dashboard pages | 11 files |
| Header with search | All dashboard pages | 11 files |
| Modal | Multiple pages | 6+ files |
| Card | All pages | 50+ instances |
| Button | All pages | 100+ instances |
| Badge/Status Pill | Multiple pages | 30+ instances |
| Table | Audits, Observations, Team | 5 files |
| Progress Bar | Dashboard, Team | 3 files |

#### Medium Priority (Feature-Specific)
| Component | Used In |
|-----------|---------|
| Risk Matrix | Correspondence Hub, Dashboard |
| Audit Log Entry | Audit Reports, Team Management |
| Circular Progress | Dashboard |
| Stats Card | Dashboard |
| User Avatar | Sidebar, Team, Header |
| Notification Bell | Header |

### 2.2 Component Extraction Process

For each component:

1. **Identify all variations** across the HTML files
2. **Define props interface** in TypeScript
3. **Create base component** with variants using `class-variance-authority`
4. **Document usage** with examples

#### Example: Button Component Extraction

Current HTML variations found:
```html
<!-- Primary -->
<button class="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg">

<!-- Secondary -->
<button class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg">

<!-- Danger -->
<button class="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg">

<!-- Ghost -->
<button class="hover:bg-slate-100 text-slate-600 px-4 py-2 rounded-lg">
```

Converted React component:
```typescript
// src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-emerald-500 hover:bg-emerald-600 text-white',
        secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
        danger: 'bg-rose-500 hover:bg-rose-600 text-white',
        ghost: 'hover:bg-slate-100 text-slate-600',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
```

### 2.3 Sidebar Component (Critical)

The sidebar is duplicated in all 11 dashboard pages. Extract into a single component:

```typescript
// src/components/layout/sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebar-store'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: 'mdi:view-dashboard' },
  { name: 'Audits', href: '/audits', icon: 'mdi:clipboard-check' },
  { name: 'Observations', href: '/observations', icon: 'mdi:eye' },
  { name: 'Risk Register', href: '/risk-register', icon: 'mdi:alert-circle' },
  { name: 'Correspondence', href: '/correspondence', icon: 'mdi:email' },
  { name: 'SAMA Letters', href: '/sama-letters', icon: 'mdi:file-document' },
  { name: 'Team', href: '/team', icon: 'mdi:account-group' },
  { name: 'Regulatory Updates', href: '/regulatory-updates', icon: 'mdi:gavel' },
  { name: 'Settings', href: '/settings', icon: 'mdi:cog' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isCollapsed, toggle } = useSidebarStore()

  return (
    <aside className={cn(
      'fixed left-0 top-0 h-screen bg-slate-800 text-white transition-all duration-300',
      isCollapsed ? 'w-20' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
          <Icon icon="mdi:shield-check" className="w-6 h-6" />
        </div>
        {!isCollapsed && (
          <span className="font-display font-bold text-lg">ComplianceOS</span>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-300 hover:bg-slate-700'
              )}
            >
              <Icon icon={item.icon} className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User section at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
        {/* User avatar and info */}
      </div>
    </aside>
  )
}
```

---

## Phase 3: Page-by-Page Migration

### 3.1 Migration Order (Recommended)

Migrate in this order based on dependencies and complexity:

| Order | Page | Priority | Complexity | Dependencies |
|-------|------|----------|------------|--------------|
| 1 | Sign In | High | Low | None |
| 2 | Sign Up | High | Low | None |
| 3 | Forgot Password | High | Low | None |
| 4 | Dashboard Layout | High | Medium | Sidebar, Header |
| 5 | Dashboard Overview | High | Medium | Stats components |
| 6 | Audits List | High | Medium | Table, Filters |
| 7 | Audit Detail | High | High | Modal, Checklist |
| 8 | Observations | Medium | Medium | Table, Filters, Modal |
| 9 | Team Management | Medium | Medium | Table, Progress |
| 10 | Correspondence Hub | Medium | High | Risk Matrix |
| 11 | SAMA Letters | Medium | Medium | Table |
| 12 | Regulatory Updates | Low | Medium | Table |
| 13 | Settings | Low | Low | Forms |
| 14 | Onboarding | Low | Medium | Multi-step form |

### 3.2 Page Migration Checklist

For each page migration:

- [ ] Create page file in correct route location
- [ ] Identify all components used on the page
- [ ] Extract any new components not yet created
- [ ] Convert HTML to JSX
- [ ] Replace hardcoded data with TypeScript types
- [ ] Add client-side interactivity with hooks
- [ ] Implement any modals/dialogs
- [ ] Test responsive behavior
- [ ] Verify navigation links work

### 3.3 File Mapping

| Current HTML File | New Next.js Route |
|-------------------|-------------------|
| `01-complianceos-sign-in-page.html` | `app/(auth)/sign-in/page.tsx` |
| `02-forgot-password-complianceos.html` | `app/(auth)/forgot-password/page.tsx` |
| `03-sign-up-complianceos.html` | `app/(auth)/sign-up/page.tsx` |
| `04-saudi-onboarding-setup-complianceos.html` | `app/(auth)/onboarding/page.tsx` |
| `05-saudi-national-compliance-configuration.html` | `app/(dashboard)/settings/compliance/page.tsx` |
| `06-complianceos-dashboard-overview.html` | `app/(dashboard)/dashboard/page.tsx` |
| `07-correspondence-hub-improved-risk-matrix-spacing.html` | `app/(dashboard)/correspondence/page.tsx` |
| `08-sama-letters-system.html` | `app/(dashboard)/sama-letters/page.tsx` |
| `09-regulatory-updates-new-rules-tracker.html` | `app/(dashboard)/regulatory-updates/page.tsx` |
| `10-observations-tracker-complianceos.html` | `app/(dashboard)/observations/page.tsx` |
| `11-audit-details-interactive-modals.html` | `app/(dashboard)/audits/[id]/page.tsx` |
| `02-audit-task-detail-complianceos.html` | `app/(dashboard)/audits/[id]/tasks/[taskId]/page.tsx` |
| `03-complianceos-audit-reports-enhanced-with-detailed-audit-logs.html` | `app/(dashboard)/audits/page.tsx` |
| `04-team-management-with-audit-logs-complianceos.html` | `app/(dashboard)/team/page.tsx` |

---

## Phase 4: State Management & Data Flow

### 4.1 Define TypeScript Types

```typescript
// src/types/audit.ts
export interface Audit {
  id: string
  title: string
  type: 'internal' | 'sama' | 'sharia'
  status: 'pending' | 'in_progress' | 'completed' | 'overdue'
  dueDate: Date
  assignee: User
  tasks: AuditTask[]
  createdAt: Date
  updatedAt: Date
}

export interface AuditTask {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'low' | 'medium' | 'high'
  assignee?: User
  dueDate?: Date
  attachments: Attachment[]
  comments: Comment[]
}

// src/types/observation.ts
export interface Observation {
  id: string
  title: string
  description: string
  source: 'sama' | 'internal_audit' | 'sharia_board' | 'external'
  severity: 'critical' | 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assignee: User
  dueDate: Date
  auditId?: string
  createdAt: Date
  updatedAt: Date
}

// src/types/risk.ts
export interface Risk {
  id: string
  title: string
  description: string
  category: string
  likelihood: 1 | 2 | 3 | 4 | 5
  impact: 1 | 2 | 3 | 4 | 5
  riskScore: number
  status: 'identified' | 'mitigating' | 'accepted' | 'resolved'
  owner: User
  mitigationPlan?: string
  createdAt: Date
  updatedAt: Date
}

// src/types/user.ts
export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'compliance_officer' | 'auditor' | 'viewer'
  department: string
  avatar?: string
  workload: number // percentage
  trainings: Training[]
}
```

### 4.2 Create Zustand Stores

```typescript
// src/stores/sidebar-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isCollapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      toggle: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
    }),
    { name: 'sidebar-storage' }
  )
)

// src/stores/notification-store.ts
import { create } from 'zustand'

interface Notification {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  read: boolean
  createdAt: Date
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        id: crypto.randomUUID(),
        read: false,
        createdAt: new Date(),
      }
      return {
        notifications: [newNotification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }
    }),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearAll: () => set({ notifications: [], unreadCount: 0 }),
}))
```

### 4.3 Mock Data Layer (For Development)

Create mock data that mirrors the current hardcoded data:

```typescript
// src/lib/mock-data/audits.ts
import { Audit } from '@/types'

export const mockAudits: Audit[] = [
  {
    id: '1',
    title: 'Q4 2025 Internal Audit',
    type: 'internal',
    status: 'in_progress',
    dueDate: new Date('2025-12-31'),
    // ... rest of data extracted from HTML
  },
  // ... more audits
]

// Create similar files for observations, risks, users, etc.
```

---

## Phase 5: Navigation & Routing

### 5.1 Implement Shared Layouts

```typescript
// src/app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="pl-64 transition-all duration-300">
        <Header />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}

// src/app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      {children}
    </div>
  )
}
```

### 5.2 Connect Pages with Navigation

Replace all hardcoded `<a href="">` tags with Next.js `<Link>` components:

```typescript
// Before (in HTML)
<a href="06-complianceos-dashboard-overview.html">Dashboard</a>

// After (in Next.js)
import Link from 'next/link'
<Link href="/dashboard">Dashboard</Link>
```

### 5.3 Implement Breadcrumbs

```typescript
// src/components/layout/breadcrumbs.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@iconify/react'

const routeLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  audits: 'Audits',
  observations: 'Observations',
  'risk-register': 'Risk Register',
  correspondence: 'Correspondence',
  'sama-letters': 'SAMA Letters',
  team: 'Team Management',
  'regulatory-updates': 'Regulatory Updates',
  settings: 'Settings',
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-2 text-sm text-slate-500">
      <Link href="/dashboard" className="hover:text-slate-700">
        <Icon icon="mdi:home" className="w-4 h-4" />
      </Link>
      {segments.map((segment, index) => {
        const href = '/' + segments.slice(0, index + 1).join('/')
        const label = routeLabels[segment] || segment
        const isLast = index === segments.length - 1

        return (
          <div key={segment} className="flex items-center gap-2">
            <Icon icon="mdi:chevron-right" className="w-4 h-4" />
            {isLast ? (
              <span className="text-slate-900 font-medium">{label}</span>
            ) : (
              <Link href={href} className="hover:text-slate-700">
                {label}
              </Link>
            )}
          </div>
        )
      })}
    </nav>
  )
}
```

---

## Phase 6: Forms & Validation

### 6.1 Set Up Form Infrastructure

```typescript
// src/lib/validations/auth.ts
import { z } from 'zod'

export const signInSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  organization: z.string().min(2, 'Organization name is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
```

### 6.2 Convert Sign-In Form

```typescript
// src/components/forms/sign-in-form.tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signInSchema, SignInInput } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SignInForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  })

  const onSubmit = async (data: SignInInput) => {
    // TODO: Implement actual authentication
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          Email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@company.com"
          {...register('email')}
          error={errors.email?.message}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          Password
        </label>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          {...register('password')}
          error={errors.password?.message}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  )
}
```

---

## Phase 7: Testing Setup

### 7.1 Install Testing Dependencies

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
npm install -D playwright @playwright/test
```

### 7.2 Configure Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 7.3 Component Test Example

```typescript
// src/components/ui/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '../button'

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('handles click events', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)

    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies variant styles correctly', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button')).toHaveClass('bg-rose-500')
  })
})
```

---

## Phase 8: Pre-Production Checklist

### 8.1 Performance Optimization

- [ ] Implement code splitting with dynamic imports
- [ ] Add loading states and Suspense boundaries
- [ ] Optimize images with next/image
- [ ] Enable Tailwind CSS purging (automatic in production)
- [ ] Add proper caching headers

### 8.2 Accessibility (a11y)

- [ ] All interactive elements have proper ARIA labels
- [ ] Color contrast meets WCAG 2.1 AA standards
- [ ] Keyboard navigation works throughout
- [ ] Screen reader testing completed
- [ ] Focus management in modals

### 8.3 SEO & Meta

- [ ] Add proper meta tags with next/head or metadata export
- [ ] Implement Open Graph tags
- [ ] Add favicon and app icons
- [ ] Create sitemap.xml (if public-facing)

### 8.4 Security

- [ ] Implement CSRF protection
- [ ] Add rate limiting to API routes
- [ ] Sanitize all user inputs
- [ ] Set up Content Security Policy headers
- [ ] Enable HTTPS only

### 8.5 Error Handling

- [ ] Create custom error pages (404, 500)
- [ ] Implement error boundaries
- [ ] Add global error handling
- [ ] Set up error logging/monitoring

---

## Appendix A: Component Inventory

Complete list of components to extract from current HTML files:

### Layout Components
| Component | Lines | Priority |
|-----------|-------|----------|
| Sidebar | ~200 | Critical |
| Header | ~50 | Critical |
| PageContainer | ~20 | High |
| Breadcrumbs | ~30 | Medium |

### UI Components
| Component | Variants | Priority |
|-----------|----------|----------|
| Button | primary, secondary, danger, ghost | Critical |
| Card | default, hover, clickable | Critical |
| Badge | success, warning, danger, info | Critical |
| Modal | default, large, fullscreen | Critical |
| Input | text, email, password, search | Critical |
| Table | default, compact, striped | High |
| Dropdown | default, searchable | High |
| Tabs | default, pills | High |
| Progress | bar, circular | Medium |
| Avatar | default, with-status | Medium |
| Tooltip | default | Low |

### Feature Components
| Component | Used In | Priority |
|-----------|---------|----------|
| RiskMatrix | Correspondence, Dashboard | High |
| ComplianceHealthScore | Dashboard | High |
| AuditLogEntry | Audits, Team | High |
| TaskChecklist | Audit Detail | High |
| StatsCard | Dashboard | Medium |
| TeamWorkloadChart | Dashboard, Team | Medium |
| ObservationRow | Observations | Medium |
| LetterCard | SAMA Letters | Medium |

---

## Appendix B: Estimated Effort

| Phase | Estimated Components/Pages | Relative Effort |
|-------|---------------------------|-----------------|
| Phase 1: Setup | N/A | Low |
| Phase 2: Component Extraction | ~25 components | Medium-High |
| Phase 3: Page Migration | 14 pages | High |
| Phase 4: State Management | ~5 stores | Medium |
| Phase 5: Navigation | N/A | Low |
| Phase 6: Forms | ~8 forms | Medium |
| Phase 7: Testing | Per component | Ongoing |
| Phase 8: Pre-production | N/A | Medium |

---

## Appendix C: Useful Commands

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server
npm run lint             # Run ESLint

# Testing
npm run test             # Run unit tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Generate coverage report
npm run test:e2e         # Run Playwright e2e tests

# Type checking
npm run type-check       # Run TypeScript compiler
```

---

## Next Steps for January 30th Demo

### Priority Order for Demo Readiness

Focus on these items to have a presentable demo by January 30th:

1. **Week 1: Foundation**
   - Set up Next.js project with Tailwind
   - Extract Sidebar and Header components (shared across all pages)
   - Create base UI components (Button, Card, Badge, Modal)

2. **Week 2: Core Pages**
   - Migrate authentication pages (sign-in, sign-up)
   - Migrate Dashboard with all stats components
   - Implement working navigation between pages

3. **Week 3: Feature Pages**
   - Migrate Audits, Observations, and Risk Register pages
   - Ensure all modals and interactions work
   - Add mock data for realistic demonstrations

4. **Pre-Presentation Polish**
   - Test all navigation flows
   - Verify responsive design on different screen sizes
   - Prepare demo script highlighting key features

### Demo Checklist

Before the January 30th presentation, ensure:

- [ ] All pages are connected via navigation (no dead links)
- [ ] Sidebar highlights the current active page
- [ ] All modals open and close correctly
- [ ] Forms show validation feedback
- [ ] Mock data tells a coherent compliance story
- [ ] Application runs smoothly without console errors
- [ ] Key workflows can be demonstrated end-to-end

### What to Tell Stakeholders

During the demo, clarify:
- "This is a fully functional frontend prototype"
- "All data shown is mock data for demonstration"
- "Backend integration will begin after feature approval"
- "The look and feel you see today is what production will look like"

---

## Post-Approval: Backend Integration Plan

Once features are approved on January 30th, the following backend work will be required:

### Database Schema Design
- Users & Roles
- Audits & Tasks
- Observations & Findings
- Risk Register entries
- Correspondence & Letters
- Audit Logs

### API Development
- RESTful or GraphQL API design
- Authentication endpoints (Auth.js)
- CRUD operations for all entities
- File upload handling
- Search and filtering

### Security Implementation
- Role-based access control (RBAC)
- Data encryption at rest and in transit
- Audit logging for compliance
- Session management
- SAMA regulatory compliance checks

### Production Infrastructure
- Database hosting (e.g., Supabase, PlanetScale, AWS RDS)
- Application hosting (e.g., Vercel, AWS)
- CI/CD pipeline
- Monitoring and alerting
- Backup and disaster recovery

---

**Note:** This guide focuses on frontend migration for the January 30th demo. Backend API development, database design, and production deployment planning will be documented separately after feature approval.
