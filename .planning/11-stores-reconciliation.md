# Phase 5 Store Migration — Sync→Async Cascade Cleanup

Resolved 13 TypeScript errors split across two patterns introduced when store actions were converted to async.

## Pattern A — async callback prop type mismatch

Widened `onAdd` prop type to accept `Promise<string | void>` in addition to `string | void`. `submitDraft` in `EditableSelect` now awaits the callback so the resolved id is correctly threaded into `onChange`.

### `src/components/ui/editable-select.tsx`
- Line 21: widened `onAdd` type from `(label, labelAr?) => string | void` to `(label, labelAr?) => string | void | Promise<string | void>`.
- Lines 139–153 (`submitDraft`): made async, awaits `effectiveOnAdd(label, labelAr)` so `typeof newId === 'string'` check still works on the resolved value.

### `src/components/settings/ListsAndCategoriesSection.tsx`
- Line 77: widened `ListSectionProps.onAdd` to match the EditableSelect signature (`ListSectionLauncherProps` inherits, so launchers at line 568 / 579 etc. now accept the async store action directly).

Pattern A callers at the following sites are now type-checked against the widened signatures and required no edits beyond the prop-type widening:
- `src/app/(dashboard)/correspondence/feed/page.tsx` lines 500, 774, 1131
- `src/app/(dashboard)/correspondence/letters/page.tsx` line 790
- `src/components/correspondence/letters/CreateLetterForm.tsx` line 308
- `src/components/correspondence/letters/TemplateEditForm.tsx` line 217
- `src/components/settings/ListsAndCategoriesSection.tsx` line 568

## Pattern B — missing `await` on store mutation

Awaited the store action and made the enclosing function `async`. Added try/catch with `console.error` where there was follow-up work that needed an error boundary.

### `src/components/correspondence/letters/CreateLetterForm.tsx`
- Lines 251–262 (`handleSubmit`): converted to async, awaits `store.create(...)` before calling `store.submitForApproval(newLetter.id)`. Wrapped in try/catch/finally so `setIsSubmitting(false)` and `onSuccess()` still run on error.
- Lines 369–378 (sub-category `onAdd`): converted callback to async, awaits `subCategoryStore.add(...)` and returns `created.id`. Wraps in try/catch returning `undefined` on failure.

### `src/components/correspondence/letters/EditableAuthorityDeptField.tsx`
- Lines 41–49: converted `onAdd` callback to async; awaits `addDepartment(...)` then returns `created.id`. try/catch returns `undefined` on failure.

### `src/components/correspondence/regulatory-updates/rules/RegisterCircularModal.tsx`
- Line 70: added `await` before `create({ ... })` (function was already `async`).

### `src/components/settings/ListsAndCategoriesSection.tsx`
- Lines 464–473 (`onAdd` inside `ListSectionLauncher` modal body): converted to async, awaits `subCategoryStore.add(...)`. The follow-up `setHighlight(created.id)` is now correctly fed the resolved id (was previously feeding a `Promise<SubCategory>`, hence the original error).

## Verification

`npx tsc --noEmit` → exit code 0 (clean).
