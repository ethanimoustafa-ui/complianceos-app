# ComplianceOS

Enterprise-grade Governance, Risk & Compliance (GRC) platform designed for financial institutions operating in Saudi Arabia.

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.2 | App Router, React Server Components |
| React | 19.2.3 | UI Framework |
| TypeScript | 5 | Type Safety (strict mode) |
| Tailwind CSS | 4 | Styling |
| Zustand | 5.0.10 | State Management |
| React Hook Form | 7.71.1 | Form Handling |
| Zod | 4.3.5 | Schema Validation |
| Iconify | 6.0.2 | Icons (Lucide) |
| date-fns | 4.1.0 | Date Utilities |

## Features

### Dashboard
- Compliance health overview with visual metrics
- SAMA submissions tracking
- Risk matrix visualization
- Team workload monitoring
- Training compliance tracking

### Observations Management
- Multi-source observations: SAMA, Internal Audit, Sharia Board, External
- Severity levels: Critical, High, Medium, Low
- Status tracking: Open, In Progress, Resolved, Closed
- Team assignments and document attachments

### Audit Management
- Audit activity logging
- Risk distribution visualization
- 12-month compliance trend charts
- Filtering by action type, audit name, and date range

### Additional Modules
- **Calendar** - Event scheduling and deadline management
- **Correspondence** - SAMA letters and communication tracking
- **Reports** - Compliance report generation
- **SAMA Letters** - Regulatory submission tracking
- **Regulatory Updates** - News feed for regulatory changes
- **Team** - User and team administration
- **Settings** - Application configuration

### Internationalization
- Bilingual support: English (EN) and Arabic (AR)
- Full RTL/LTR layout support

## Project Structure

```
complianceos-app/
├── src/
│   ├── app/
│   │   ├── (auth)/              # Auth routes
│   │   │   ├── sign-in/
│   │   │   ├── sign-up/
│   │   │   ├── forgot-password/
│   │   │   ├── verify-email/
│   │   │   └── onboarding/
│   │   │
│   │   ├── (dashboard)/         # Protected routes
│   │   │   ├── dashboard/
│   │   │   ├── observations/
│   │   │   ├── audits/
│   │   │   ├── calendar/
│   │   │   ├── correspondence/
│   │   │   ├── reports/
│   │   │   ├── sama-letters/
│   │   │   ├── regulatory-updates/
│   │   │   ├── team/
│   │   │   └── settings/
│   │   │
│   │   ├── globals.css
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── ui/                  # Reusable UI primitives
│   │   ├── layout/              # Sidebar, Header
│   │   ├── dashboard/           # Dashboard-specific components
│   │   ├── observations/        # Observation management
│   │   └── audits/              # Audit visualization
│   │
│   ├── lib/                     # Utility functions
│   ├── stores/                  # Zustand stores
│   ├── i18n/                    # Internationalization
│   │   ├── hooks/
│   │   ├── components/
│   │   └── dictionaries/
│   └── types/                   # TypeScript definitions
```

## Getting Started

### Prerequisites
- Node.js 18.17 or later

### Installation

```bash
cd complianceos-app
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm run start
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## License

See [LICENSE](./LICENSE) for details.
