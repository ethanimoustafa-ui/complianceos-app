# Correspondence Feed — User Stories

**Route:** `/correspondence/feed`
**Primary roles:** compliance officer · compliance manager · org admin · auditor · viewer
**Domain entity:** unified correspondence stream (circulars, letters, observations, advisory, policies, training, risks)

## What this page is for

The feed is the landing tab for the Correspondence module — `/correspondence` redirects here. It presents every inbound and outbound regulator interaction in one chronological stream so an officer can answer "what has hit our desk this week?" without opening eight separate modules. Each feed item links back to its source module (circular detail, letter detail, observation detail, etc.). It is the busiest aggregator page in the app (~1300 lines), pulling from circulars, letters, advisory, observations, policies, training, risks, team, and correspondence-types.

## Primary user journeys

### Story 1 — Scan all recent regulator correspondence in one place

**As a** compliance officer at the start of the day
**I want to** see every new circular, letter, observation, and advisory in one feed sorted by date
**So that** I don't miss anything that arrived overnight.

**Acceptance criteria**:
- Landing at `/correspondence/feed` shows a vertical feed of items sorted newest-first
- Each item shows authority (SAMA / CMA / IA / ZATCA / etc.), type (circular / letter / observation / advisory / etc.), reference, title, date, status chip
- Items render with their authority-specific color and icon
- Hard-reload the page → the same items return (server-backed)
- The feed pulls from circulars, letters, observations, advisory, policies, training, and correspondence

### Story 2 — Open a specific item via deep link

**As a** compliance manager who received an email link to a circular
**I want to** click `/correspondence/feed?id=<itemId>` and have that item pre-selected
**So that** I land directly on what was shared with me.

**Acceptance criteria**:
- Visiting `/correspondence/feed?id=<itemId>` auto-opens the detail panel for that item
- If the item doesn't exist or RLS hides it, the page degrades gracefully to the unfiltered feed (no crash)
- Removing the `?id=` param returns to the unfiltered feed view
- The browser back button restores the previous selection state

### Story 3 — Filter the feed by authority, type, or framework

**As an** auditor preparing a SAMA inspection brief
**I want to** filter the feed to SAMA-only items in the relevant date range
**So that** I export only what the inspector asked for.

**Acceptance criteria**:
- Filter controls are visible at the top of the feed (authority, type, optionally date range)
- Toggling a filter immediately narrows the visible feed
- The filter state persists during the session
- The framework chip list reads from `useFrameworkConfigStore` so only the org's pinned frameworks appear
- A "Clear filters" affordance restores the unfiltered view

### Story 4 — Drill into the source module from a feed item

**As a** compliance officer
**I want to** click a circular feed item and land on its rules page with the full implementation tracker
**So that** I can take action without losing context.

**Acceptance criteria**:
- Each feed item exposes a link to its source module page (e.g. circular → `/correspondence/regulatory-updates/rules?id=<id>`)
- Letter items link to `/correspondence/letters?id=<id>`
- Observation items link to `/correspondence/observations?id=<id>`
- Advisory items link to `/correspondence/advisory?id=<id>`
- The destination page opens with that item pre-selected

### Story 5 — Manage inline correspondence types

**As an** org admin who notices a missing correspondence type
**I want to** add a new type (e.g. "Sharia Inquiry") from the feed page
**So that** I don't have to leave the feed to fix a vocabulary gap.

**Acceptance criteria**:
- A CRUD widget for correspondence types is reachable from the feed page
- Adding a new type writes via `/api/settings/correspondence-types` and persists
- The new type immediately appears in filter dropdowns and any other module that lists correspondence types
- Deleting an in-use type asks for confirmation

## Edge cases the page should handle

- Empty state: a brand-new tenant with no correspondence shows a friendly "no items yet" panel, not a broken layout
- Loading state: skeleton rows render while the 12 source stores hydrate (page mounts a heavy fan-out of `fetchAll()` calls)
- Network failure: a failed fetch on one source store falls back to showing the items from the others
- RBAC: viewers can see the feed but cannot manage correspondence types; the inline-CRUD widget is hidden
- RTL: Arabic items render right-to-left with mirrored layout

## Out of scope for this page

- Creating new circulars, letters, advisory, observations (each module owns its own create flow)
- PDF generation for the feed itself (export lives per-module)
- Real-time push of new items (poll-on-mount only in MVP)

## Open questions

- Should the feed live-poll for new items, or only refresh on navigation?
- What's the date format precedence — `useUserPreferencesStore().dateFormat` or per-item authority preference?
- When deleting a correspondence type that's in use, what's the desired behaviour: block, soft-delete, or reassign?
