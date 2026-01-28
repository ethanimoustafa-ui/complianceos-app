# ComplianceOS - Feature Validation Checklist

**Version:** 2.0
**Date:** January 28, 2026
**Purpose:** Comprehensive testing checklist for all implemented features

---

## Quick Reference

| # | Category | Status |
|---|----------|--------|
| 1 | TypeScript Types | To Test |
| 2 | Zustand Stores | To Test |
| 3 | CRUD Modals | To Test |
| 4 | Form Validations | To Test |
| 5 | Auth Flows | To Test |
| 6 | Dashboard Wiring | To Test |
| 7 | Navigation | To Test |
| 8 | i18n (EN/AR + RTL) | To Test |
| 9 | Role-Based Access | To Test |
| 10 | File Uploads | To Test |
| 11 | Comments System | To Test |
| 12 | Export (CSV/PDF) | To Test |
| 13 | Empty States | To Test |
| 14 | Sorting | To Test |
| 15 | Checklist CRUD | To Test |
| 16 | UI Polish | To Test |

---

## 1. TypeScript Types

### Test: Type Safety
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 1.1 | Run `npx tsc --noEmit` | Open terminal → Run `npx tsc --noEmit` | No TypeScript errors | [x] |
| 1.2 | Check `src/types/index.ts` exports | Open file → Verify User, Observation, Audit, Report types exist | All entity types exported | [x] |
| 1.3 | Verify store types | Open each store file in `src/stores/` → Check interface definitions | All stores have proper TypeScript interfaces | [?] |

---

## 2. Zustand Stores

### Test: Store Functionality
| # | Store | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-------|-----------|------------------|-----------------|-----------|
| 2.1 | observation-store | Create observation | Go to /observations → Click "Add Observation" → Fill form → Submit | State updates, new observation in list | [ ] |
| 2.2 | observation-store | Update observation | Click observation row → Click Edit → Change values → Save | State updates with new values | [ ] |
| 2.3 | observation-store | Delete observation | Click observation → Click Delete → Confirm | Observation removed from state | [ ] |
| 2.4 | observation-store | Add comment | Open observation detail → Type in comment box → Click "Add Update" | Comment added to selectedObservation | [ ] |
| 2.5 | observation-store | Add checklist item | Open observation detail → Type in checklist input → Click + button | Checklist item appears in observation | [ ] |
| 2.6 | observation-store | Remove checklist item | Open observation detail → Hover checklist item → Click X button | Checklist item removed from observation | [ ] |
| 2.7 | observation-store | Toggle checklist | Open observation detail → Click checkbox on checklist item | Completed status toggles, strikethrough appears | [ ] |
| 2.8 | auth-store | Login | Go to /login → Enter email/password → Click Sign In | User state populated, isAuthenticated true | [ ] |
| 2.9 | auth-store | Logout | Click user avatar → Click Logout | User state cleared, isAuthenticated false | [ ] |
| 2.10 | audit-store | CRUD operations | Go to /reports → Create/Edit/Delete audits | Audits can be created/read/updated/deleted | [ ] |
| 2.11 | report-store | Generate report | Go to /reports → Click Generate Report → Select options | Report generated and stored | [ ] |
| 2.12 | calendar-store | Add task | Go to /calendar → Click on date → Fill task form → Save | Task appears on calendar | [ ] |
| 2.13 | notification-store | Add notification | Trigger action that creates notification (e.g., create observation) | Notification appears in bell icon | [ ] |

---

## 3. CRUD Modals

### Test: Modal Operations
| # | Page | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 3.1 | Observations | Click "Add Observation" | Go to /observations → Click green "Add Observation" button | AddObservationModal opens with empty form | [ ] |
| 3.2 | Observations | Fill form and submit | In modal → Fill Title, Severity, Source, Due Date → Click Create | New observation created, modal closes, table refreshes | [ ] |
| 3.3 | Observations | Click observation row | Go to /observations → Click any table row | ObservationDetailModal opens with observation data | [ ] |
| 3.4 | Observations | Click edit in detail modal | Open detail modal → Click Edit button | EditObservationModal opens with pre-filled data | [ ] |
| 3.5 | Audits | Click "New Audit" | Go to /reports → Click "New Audit" button | AddAuditModal opens with audit type selection | [ ] |
| 3.6 | Audits | Fill form and submit | In modal → Select type → Fill Title, Framework, Due Date → Click Create | New audit created, modal closes | [ ] |
| 3.7 | Settings | Click "New Template" | Go to /settings → Scroll to Audit Templates → Click "New Template" | Template modal opens | [ ] |
| 3.8 | SAMA Letters | Click "Draft New Letter" | Go to /sama-letters → Click "Draft New Letter" button | CreateLetterModal opens with template selection | [ ] |
| 3.9 | All Modals | Click X or Cancel | Open any modal → Click X icon or Cancel button | Modal closes without saving changes | [ ] |
| 3.10 | All Modals | Click outside modal | Open any modal → Click on dark overlay outside modal | Modal closes (behavior may vary by modal) | [ ] |

---

## 4. Form Validations

### Test: Validation Rules
| # | Form | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 4.1 | Login | Submit empty form | Go to /login → Leave fields empty → Click Sign In | Error messages shown for email/password | [ ] |
| 4.2 | Login | Submit invalid email | Go to /login → Type "notanemail" → Click Sign In | "Invalid email" error shown | [ ] |
| 4.3 | Sign Up | Password too short | Go to /sign-up → Enter password "123" → Submit | "Password must be 8+ characters" error | [ ] |
| 4.4 | Sign Up | Passwords don't match | Go to /sign-up → Enter different passwords → Submit | "Passwords don't match" error | [ ] |
| 4.5 | Forgot Password | Invalid email format | Go to /forgot-password → Type "invalid" → Submit | Validation error shown | [ ] |
| 4.6 | Add Observation | Submit without title | Open Add Observation modal → Leave title empty → Click Create | "Title required" error below input | [ ] |
| 4.7 | Add Observation | Submit without severity | Open Add Observation modal → Fill title only → Click Create | "Severity required" error shown | [ ] |
| 4.8 | All Forms | Valid data submitted | Fill any form with valid data → Submit | Form submits successfully, no errors | [ ] |

---

## 5. Auth Flows

### Test: Authentication Pages
| # | Page | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 5.1 | `/login` | Page loads | Navigate to http://localhost:3000/login | Login form with email/password fields displayed | [ ] |
| 5.2 | `/login` | Valid credentials | Enter any email + password → Click Sign In | Redirects to /dashboard | [ ] |
| 5.3 | `/login` | Invalid credentials | Enter wrong credentials → Click Sign In | Error message "Invalid credentials" shown | [ ] |
| 5.4 | `/sign-up` | Page loads | Navigate to /sign-up or click "Sign up" link | Sign up form with name/email/password fields | [ ] |
| 5.5 | `/sign-up` | Valid registration | Fill all fields correctly → Click Create Account | Success message, redirect to /verify-email | [ ] |
| 5.6 | `/forgot-password` | Page loads | Navigate to /forgot-password or click "Forgot password" | Email input form displayed | [ ] |
| 5.7 | `/forgot-password` | Submit valid email | Enter valid email → Click Send Reset Link | "Check your email" success message | [ ] |
| 5.8 | `/verify-email` | Page loads | Navigate to /verify-email | 6-digit verification code input displayed | [ ] |
| 5.9 | `/verify-email` | Valid code | Enter 6 digits → Click Verify | Redirects to /onboarding or /dashboard | [ ] |
| 5.10 | `/onboarding` | Page loads | Navigate to /onboarding | Multi-step wizard with progress indicators | [ ] |
| 5.11 | `/onboarding` | Complete all steps | Fill each step → Click Continue → Complete | Redirects to /dashboard | [ ] |
| 5.12 | Protected routes | Access without auth | Clear localStorage → Navigate to /dashboard | Redirects to /login | [ ] |

---

## 6. Dashboard Wiring

### Test: Dashboard Components
| # | Component | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|-----------|------------------|-----------------|-----------|
| 6.1 | Stats Cards | Page loads | Login → Navigate to /dashboard → Look at top row | 4 stat cards (Compliance Health, Pending, Deadlines, Observations) with values | [ ] |
| 6.2 | Compliance Score | Page loads | On dashboard → Look at circular progress widget | Circular progress shows percentage (e.g., 94.2%) | [ ] |
| 6.3 | Trend Chart | Page loads | On dashboard → Scroll to Compliance Trend section | 12-month line chart renders with data points | [ ] |
| 6.4 | Recent Activity | Page loads | On dashboard → Look at Recent Activity section | Activity timeline with timestamped items | [ ] |
| 6.5 | Quick Actions | Click action button | On dashboard → Click any Quick Action button (e.g., "New Observation") | Navigates to correct page or opens modal | [ ] |
| 6.6 | Upcoming Tasks | Page loads | On dashboard → Look at Upcoming Tasks/Deadlines section | Task list with due dates and assignees | [ ] |
| 6.7 | Risk Distribution | Page loads | On dashboard → Look at Risk Distribution chart | Risk breakdown by category (High/Medium/Low) | [ ] |

---

## 7. Navigation

### Test: App Navigation
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 7.1 | Click Dashboard in sidebar | In sidebar → Click "Dashboard" icon/text | URL changes to /dashboard, page loads | [ ] |
| 7.2 | Click Observations in sidebar | In sidebar → Click "Observations" | URL changes to /observations, table loads | [ ] |
| 7.3 | Click SAMA Letters in sidebar | In sidebar → Click "SAMA Letters" | URL changes to /sama-letters | [ ] |
| 7.4 | Click Regulatory Updates in sidebar | In sidebar → Click "Regulatory Updates" | URL changes to /regulatory-updates | [ ] |
| 7.5 | Click Risk Register in sidebar | In sidebar → Click "Risk Register" | URL changes to /risk-register | [ ] |
| 7.6 | Click Calendar in sidebar | In sidebar → Click "Calendar" | URL changes to /calendar, calendar view loads | [ ] |
| 7.7 | Click Reports in sidebar | In sidebar → Click "Reports" | URL changes to /reports | [ ] |
| 7.8 | Click Team in sidebar | In sidebar → Click "Team" | URL changes to /team | [ ] |
| 7.9 | Click Settings in sidebar | In sidebar → Click "Settings" (gear icon) | URL changes to /settings | [ ] |
| 7.10 | Active route | Navigate to any page → Check sidebar | Current page's sidebar item has highlighted/active style | [ ] |
| 7.11 | Collapse sidebar | Click collapse button (<<) at bottom of sidebar | Sidebar collapses to icons only, labels hidden | [ ] |
| 7.12 | Expand sidebar | When collapsed → Click expand button (>>) | Sidebar expands with full labels visible | [ ] |

---

## 8. i18n (EN/AR + RTL)

### Test: Internationalization
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 8.1 | Default language | Open app fresh → Check page text | Page loads in English | [ ] |
| 8.2 | Toggle to Arabic | Click language toggle in header (EN/AR) → Select Arabic | All text changes to Arabic (العربية) | [ ] |
| 8.3 | Arabic layout | After switching to Arabic → Check page direction | Page switches to RTL (right-to-left), sidebar on right | [ ] |
| 8.4 | Toggle back to English | In Arabic mode → Click language toggle → Select English | All text changes back to English | [ ] |
| 8.5 | English layout | After switching to English → Check page direction | Page switches to LTR (left-to-right), sidebar on left | [ ] |
| 8.6 | Sidebar in Arabic | Switch to Arabic → Check sidebar | Navigation items display in Arabic (لوحة القيادة, الملاحظات, etc.) | [ ] |
| 8.7 | Forms in Arabic | Switch to Arabic → Open any form modal | Labels and placeholders display in Arabic | [ ] |
| 8.8 | Buttons in Arabic | Switch to Arabic → Check button text | Button text in Arabic (إنشاء, إلغاء, حفظ, etc.) | [ ] |
| 8.9 | Date formats | Switch to Arabic → Check date displays | Dates display in Arabic format | [ ] |
| 8.10 | Number formats | Switch to Arabic → Check numbers | Numbers display correctly (may use Arabic numerals) | [ ] |

---

## 9. Role-Based Access

### Role Hierarchy
| Role | Description | Permissions |
|------|-------------|-------------|
| `officer` | Basic user | View only |
| `manager` | Can create/edit | View + Create + Edit + Export |
| `admin` | Full access | All permissions including Delete + Settings + Team |

### Test: RoleGuard Component
| # | Page | Element | Admin | Manager | Officer | Pass/Fail |
|---|------|---------|-------|---------|---------|-----------|
| 9.1 | Observations | "Add Observation" button | Visible | Visible | Hidden | [ ] |
| 9.2 | Observations | "Export CSV" button | Visible | Visible | Hidden | [ ] |
| 9.3 | Observations Table | Actions menu (3 dots) | Visible | Hidden | Hidden | [ ] |
| 9.4 | SAMA Letters | "Manage Templates" link | Visible | Visible | Hidden | [ ] |
| 9.5 | SAMA Letters | Template Edit button | Visible | Visible | Hidden | [ ] |
| 9.6 | SAMA Letters | Template Delete button | Visible | Hidden | Hidden | [ ] |
| 9.7 | Team | "Invite Member" button | Visible | Hidden | Hidden | [ ] |
| 9.8 | Team | Member Edit button | Visible | Hidden | Hidden | [ ] |
| 9.9 | Settings | "Add Standard" button | Visible | Hidden | Hidden | [ ] |
| 9.10 | Settings | "New Template" button | Visible | Hidden | Hidden | [ ] |
| 9.11 | Settings | Framework Configure buttons | Visible | Hidden | Hidden | [ ] |
| 9.12 | Settings | Template Edit button | Visible | Visible | Hidden | [ ] |
| 9.13 | Settings | Template Delete button | Visible | Hidden | Hidden | [ ] |

### How to Test Roles
1. Open `src/stores/auth-store.ts`
2. Find line ~45 with `role: 'admin'`
3. Change to test different permissions:
   - `role: 'officer'` - View only (most restricted)
   - `role: 'manager'` - View + Create + Edit + Export
   - `role: 'admin'` - Full access (including Delete, Settings, Team)
4. Save file and refresh browser
5. **Important**: Clear localStorage if role doesn't change:
   - Open DevTools > Application > Local Storage
   - Delete `auth-storage` key

### Detailed Test Steps

**Test 1: Officer Role (View Only)**
```
1. Set role: 'officer' in auth-store.ts
2. Clear localStorage and refresh
3. Navigate to /observations
   Expected: NO "Add Observation" button
   Expected: NO "Export CSV" button
4. Click any observation row
   Expected: Detail modal opens (view only)
5. Navigate to /settings
   Expected: NO admin buttons visible
```

**Test 2: Manager Role (Create/Edit)**
```
1. Set role: 'manager' in auth-store.ts
2. Clear localStorage and refresh
3. Navigate to /observations
   Expected: "Add Observation" visible
   Expected: "Export CSV" visible
4. Click "Add Observation"
   Expected: Modal opens, can create
5. Table action menu (3 dots)
   Expected: Hidden (no delete permission)
6. Navigate to /settings
   Expected: Can edit templates
   Expected: Cannot delete or access admin settings
```

**Test 3: Admin Role (Full Access)**
```
1. Set role: 'admin' in auth-store.ts
2. Clear localStorage and refresh
3. Navigate to /observations
   Expected: ALL buttons visible
4. Table action menu (3 dots)
   Expected: Visible, can delete
5. Navigate to /team
   Expected: "Invite Member" visible
6. Navigate to /settings
   Expected: ALL buttons visible (Add Standard, New Template, Configure)
```

---

## 10. File Uploads

### Test: FileUpload Component
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 10.1 | FileUpload renders | Open observation detail modal → Scroll to Attachments section | Upload area with dashed border and drag zone visible | [ ] |
| 10.2 | Click to browse | Click on "Click to upload" text in upload zone | System file picker dialog opens | [ ] |
| 10.3 | Select file | In file picker → Select a PDF/image → Click Open | File appears in upload list with name and size | [ ] |
| 10.4 | Drag file over | Drag a file from desktop → Hover over upload zone | Drop zone highlights (border color changes) | [ ] |
| 10.5 | Drop file | Drag file → Drop onto upload zone | File added to list below upload zone | [ ] |
| 10.6 | Multiple files | Select or drag multiple files at once | All files appear in list | [ ] |
| 10.7 | Remove file | In file list → Click X/trash icon next to file | File removed from list | [ ] |
| 10.8 | File type validation | Try to upload .exe or unsupported file type | Error message "Invalid file type" shown | [ ] |
| 10.9 | File size validation | Try to upload file > 10MB | Error message "File too large" shown | [ ] |

---

## 11. Comments System

### Test: Observation Comments
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 11.1 | Open observation detail | Go to /observations → Click any row | Comment/Updates section visible at bottom of modal | [ ] |
| 11.2 | Type comment text | In observation modal → Find "Add an update" textarea → Type text | Text appears in input field | [ ] |
| 11.3 | Click "Add Update" | Type a comment → Click "Add Update" button | Comment added to timeline above, input clears | [ ] |
| 11.4 | Comment displays | After adding comment → Check timeline | Shows author avatar, name, timestamp, and content | [ ] |
| 11.5 | Multiple comments | Add 2-3 comments → Check timeline | All comments visible in chronological order | [ ] |
| 11.6 | Empty comment | Leave textarea empty → Try to click "Add Update" | Button disabled or shows validation error | [ ] |

---

## 12. Export (CSV/PDF)

### Test: Export Functionality
| # | Page | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 12.1 | Observations | Click "Export CSV" | Go to /observations → Click "Export CSV" button (need Manager/Admin role) | CSV file downloads to browser | [ ] |
| 12.2 | Observations CSV | Check file content | Open downloaded CSV in Excel/text editor | Contains columns: Title, Severity, Status, Due Date, Assignee | [ ] |
| 12.3 | Reports | Export report | Go to /reports → Select report → Click Export | PDF or CSV file generates and downloads | [ ] |
| 12.4 | Team | Export logs | Go to /team → Training tab → Click Export button | CSV file with training records downloads | [ ] |
| 12.5 | Calendar | Export tasks | Go to /calendar → Click Export/Download icon | CSV file with calendar tasks downloads | [ ] |

### CSV Format Check
- Headers match data columns
- Special characters escaped properly
- Dates formatted consistently
- All records included

---

## 13. Empty States

### Test: Empty State Components
| # | Page | Condition | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 13.1 | Observations | No observations exist | Delete all observations (or mock empty state) | Empty state with illustration, "No observations yet", "Add Observation" button | [ ] |
| 13.2 | Observations | Filter returns 0 | Apply filter (e.g., Severity=Critical) that matches nothing | "No results found" with "Clear Filters" button | [ ] |
| 13.3 | Team (Training) | Filter returns 0 employees | Go to /team → Training tab → Filter by dept with no matches | Empty state for training records table | [ ] |
| 13.4 | Regulatory Updates | Rules filter returns 0 | Go to /regulatory-updates → Rules tab → Search "zzzzz" | "No results found" with clear filters option | [ ] |
| 13.5 | Regulatory Updates | Policies filter returns 0 | Go to /regulatory-updates → Policies tab → Filter with no matches | "No results found" with clear filters option | [ ] |
| 13.6 | Empty State | Click "Clear Filters" | When showing empty state → Click "Clear Filters" button | Filters reset, original data reappears | [ ] |
| 13.7 | Empty State | Click "Add" button | When showing "No data" empty state → Click "Add" button | Opens corresponding add modal | [ ] |

---

## 14. Sorting

### Test: Table Sorting
| # | Page | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|------|-----------|------------------|-----------------|-----------|
| 14.1 | Observations | Click "Title" header | Go to /observations → Click "Title" column header | Table sorts A-Z by title | [ ] |
| 14.2 | Observations | Click "Title" again | Click "Title" header a second time | Table sorts Z-A (reversed) | [ ] |
| 14.3 | Observations | Click "Severity" header | Click "Severity" column header | Sorts by severity level (Critical > High > Medium > Low) | [ ] |
| 14.4 | Observations | Click "Due Date" header | Click "Due Date" column header | Sorts by date (earliest/latest first) | [ ] |
| 14.5 | Team | Click sortable headers | Go to /team → Click Name or Department header | Data sorts correctly by that column | [ ] |
| 14.6 | Sort indicator | Active sort column | After clicking any sortable header | Arrow icon (↑/↓) shows on active column | [ ] |

---

## 15. Checklist CRUD

### Test: Checklist Add/Remove (Observation Detail)
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 15.1 | Open observation detail | Go to /observations → Click any row | "Remediation Checklist" section visible in modal | [ ] |
| 15.2 | Type in checklist input | Find "Add a new checklist item" input → Type text | Text appears in input field | [ ] |
| 15.3 | Click + button | Type text in input → Click green + button | New checklist item added to list below | [ ] |
| 15.4 | Press Enter in input | Type text in input → Press Enter key | New checklist item added (same as clicking +) | [ ] |
| 15.5 | Empty input + click | Leave input empty → Click + button | Nothing happens, button may be disabled | [ ] |
| 15.6 | Hover checklist item | Move mouse over any checklist item | X button appears on the right side | [ ] |
| 15.7 | Click X button | Hover item → Click X button | Checklist item removed from list | [ ] |
| 15.8 | Click checkbox | Click the circle/checkbox on left of item | Item toggles between completed/incomplete | [ ] |
| 15.9 | Completed item | Mark item as completed | Shows green checkmark, text has strikethrough | [ ] |
| 15.10 | Progress updates | Complete/uncomplete items | "X% Complete" badge updates dynamically | [ ] |

---

## 16. UI Polish

### Test: Visual Consistency
| # | Test Case | Scenario / Steps | Expected Result | Pass/Fail |
|---|-----------|------------------|-----------------|-----------|
| 16.1 | Typography | Visit multiple pages → Compare heading and body text | Consistent font sizes (headings, body, labels) | [ ] |
| 16.2 | Colors | Visit all pages → Check buttons, links, accents | Consistent emerald (#10B981) primary color | [ ] |
| 16.3 | Spacing | Compare cards, sections across pages | Consistent padding/margins (8px, 16px, 24px increments) | [ ] |
| 16.4 | Buttons | Check all button types across app | Primary (emerald), outline, ghost styles consistent | [ ] |
| 16.5 | Cards | Compare cards on dashboard, observations, settings | Consistent border radius, shadow, padding | [ ] |
| 16.6 | Hover states | Hover over buttons, links, table rows | All interactive elements have visible hover effect | [ ] |
| 16.7 | Focus states | Tab through page using keyboard | Visible focus ring on focusable elements | [ ] |
| 16.8 | Loading states | Submit forms, load pages | Spinners/skeletons appear during loading | [ ] |
| 16.9 | Error states | Trigger form errors → Check styling | Error messages red, consistent placement below inputs | [ ] |
| 16.10 | Responsive | Resize browser window (desktop → tablet → mobile) | Layout adapts, no horizontal scroll, readable text | [ ] |
| 16.11 | Animations | Open/close modals, dropdowns, hover items | Smooth transitions (fade, slide), no jarring jumps | [ ] |
| 16.12 | Icons | Check icons across pages | Consistent Iconify style (lucide icons), same size | [ ] |

---

## Test Environment Setup

### Prerequisites
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run TypeScript check
npx tsc --noEmit

# Run linter
npm run lint
```

### Test Data
The app uses mock data for demonstration. To test:
1. Navigate to each page
2. Interact with UI elements
3. Verify expected behaviors

### Browser Testing
Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA Tester | | | |
| Product Owner | | | |

---

## Notes

_Add any testing notes, bugs found, or observations here:_

1.
2.
3.
