# Help Center content

The in-app Help Center (the **❓ button** in the left sidebar) is currently
showing a **"Coming Soon"** state because we don't have real help content yet.

## How it works

There is a single on/off switch:

```
src/config/help-center.ts  →  export const HELP_CENTER_ENABLED = false
```

- `false` → users see the branded **"Coming Soon"** panel.
- `true`  → users see the searchable article list.

So when you're ready to launch help content, you only change that one line to
`true`.

## How to add content

1. **Write your articles here** — put them in [`articles.md`](./articles.md) in
   this folder. That file is the human-friendly source of truth; edit it freely.

2. **Mirror each article into the app** — the Help Center renders from a seeded
   store at `src/stores/help-store.ts`. Each article is an object:

   ```ts
   {
     id: 'getting-started',
     title: 'Getting started with ComplianceOS',
     summary: 'A 2-minute tour of the dashboard, calendar, and reports.',
     content: 'Full article body shown in the detail popup…',
     category: 'Getting Started', // one of the pills in the panel
     icon: 'lucide:rocket',       // any iconify icon id
   }
   ```

   Categories available today: `Getting Started`, `Calendar`, `Reports`,
   `Compliance`, `Team Management`, `Settings`.

3. **Flip the switch** — set `HELP_CENTER_ENABLED = true` in
   `src/config/help-center.ts` and reload. Done.

> Tip: when you have a lot of content, ping me and I can wire the panel to read
> straight from these markdown files (a small markdown loader) so you never have
> to touch the store again.
