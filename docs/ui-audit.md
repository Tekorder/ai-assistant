# UI audit: inconsistencies and feature ideas

_Audit date: 2026-11-01 (branch `reminders`, after `61539bb`). Based on reading the code, not on running the app._

## Style philosophy

There's no written visual style guide yet ([BEST_PRACTICES.md](../BEST_PRACTICES.md) covers code only). These are the rules the codebase already follows in most places, worked out from the theme system and recent commits ("standarize tooltips", "remove borders"):

- **Colors come only from theme tokens.** Use the `--assistant-*` CSS variables from [themes.ts](../app/assistant/_theme/themes.ts). Every theme family has a light and a dark mode, so hardcoded colors break at least one of them.
- **Tooltips use `data-tip`.** Never the browser's `title` attribute ([Tooltip.tsx](../components/Tooltip.tsx)).
- **Surfaces are glass and borderless.** Panels float on the background; spacing separates content, not lines.
- **Task lists use the Agenda layout.** Every task list builds from the pieces in [AgendaList.tsx](../app/assistant/components/AgendaList.tsx).
- **Controls reuse the shared classes.** Buttons, inputs and tabs use the `panel*` classes in [themes.module.css](../app/assistant/_theme/themes.module.css).
- **Text sizes use the type scale.** [globals.css](../app/globals.css) sets every Tailwind size one pixel larger because THICCCBOI reads small.

## UI inconsistencies

### 1. Every dialog is built by hand

About 20 components draw their own full-screen overlay. [HabitModal.tsx](../app/assistant/components/habits/HabitModal.tsx) is the best one: it's rendered at the app root, has `role="dialog"` and `aria-modal`, and Escape closes only the top dialog. The others drift:

- The confirm dialogs differ in width (320, 360 or 380px), button layout (right-aligned text buttons or two equal-width buttons), text size (13 or 14px) and the red on the delete button:
  - [DayPanel.tsx:604](../app/assistant/components/DayPanel.tsx#L604)
  - [SettingsPanel.tsx:249](../app/assistant/components/SettingsPanel.tsx#L249) and [:286](../app/assistant/components/SettingsPanel.tsx#L286)
  - [page.tsx:1585](../app/assistant/page.tsx#L1585)
  - [Sidebar.tsx:1239](../app/assistant/components/Sidebar.tsx#L1239)
  - [Timeline.tsx:806](../app/assistant/components/tabs/Timeline.tsx#L806) and [:891](../app/assistant/components/tabs/Timeline.tsx#L891)
- Deleting a habit ([useHabitDialogs.tsx](../app/assistant/components/habits/useHabitDialogs.tsx)) is a third confirm style.
- Escape does nothing in DateRangeDialog, DeleteWithOpenTasksDialog, RangeTasksDialog, the Settings confirms or the clear-chat confirm.
- Logout uses the browser's `window.confirm` ([Menu.tsx:101](../app/assistant/components/Menu.tsx#L101)).

**Fix:** turn HabitModal into a general `<Modal>`, add a `<ConfirmDialog tone="danger">` on top of it, and move every dialog over.

### 2. Stacking order is guesswork

The code uses 27 different z-index values, from `z-10` to `z-[10060]` (`z-200` and `z-[200]`, `z-[999]`, `z-[9998]`, `z-[10040]`, `z-[10050]`, `z-[10060]` and so on), plus some set inline with `style={{ zIndex }}`.

**Fix:** define named levels (`--z-dropdown`, `--z-panel`, `--z-modal`, `--z-toast`, `--z-tooltip`) and use only those.

### 3. Text sizes ignore the type scale

The components use fixed pixel sizes (`text-[13px]` and similar) over 540 times, across 23 different sizes from 8 to 44px. Because the scale is shifted up one pixel, `text-sm` is 15px and sits right next to the many `text-[14px]`.

| Usages | Class |
|---|---|
| 155 | `text-[13px]` |
| 125 | `text-[12px]` |
| 119 | `text-[14px]` |
| 38 | `text-[11px]` |
| 25 | `text-[16px]` |
| 21 | `text-[10px]` |
| ~60 | 17 other sizes |

**Fix:** settle on about 6 named text roles (caption, meta, body, label, title, display) and replace the pixel sizes.

### 4. Status colors are hardcoded

`--assistant-danger-text` and `--assistant-success-text` exist, but the code also uses:

- **Reds:** `#f87171`, `#dc2626`, `#ef4444`, `rgba(239,68,68,…)` and `bg-red-600`.
- **Greens:** `#22c55e`, `#16a34a`, `bg-emerald-400` and `rgba(52,211,153,…)`.
- **Status colors set per component:** [ListStatusPill.tsx:8](../app/assistant/components/ListStatusPill.tsx#L8) and the sync-status dots in [TopNavBar.tsx:170](../app/assistant/components/TopNavBar.tsx#L170).

**Fix:** add danger, success and warning tokens for both backgrounds and text, in light and dark versions.

### 5. A global override recolors things behind your back

[page.tsx:1649-1700](../app/assistant/page.tsx#L1649) contains a block of `!important` rules that match class names containing old Matrix-theme colors (`[class*='bg-[#52b352]']` and similar) and swap in theme colors. Most of the classes it targets no longer exist. The green/emerald rules still apply, though, so the `bg-emerald-400` progress bar in Calendar actually shows `tone-1`, not the green written in the source.

Related leftovers:

- `--assistant-active-text` is hardcoded to lime `#d5fc43` in [themes.ts](../app/assistant/_theme/themes.ts).
- [Chatbox.tsx:235](../app/assistant/components/Chatbox.tsx#L235) falls back to `#050505` and `#52b352`.

**Fix:** delete the override block and use tokens directly.

### 6. Generic controls live in feature folders

- HabitSwitch, HabitChips, HabitSection, HabitRow and HabitIconButton in [HabitModal.tsx](../app/assistant/components/habits/HabitModal.tsx) aren't habit-specific. HabitSwitch is the only toggle switch in the app with `role="switch"`.
- Card, Segmented and Empty in [DashboardPieces.tsx](../app/assistant/components/dashboard/DashboardPieces.tsx) are generic too.

**Fix:** move them to a shared `components/ui/` folder and use them in Settings and NotificationSettings.

### 7. Inputs, buttons and empty states each come in several styles

- **Text inputs:** `panelInput` (11 files), `quickSearchInput` (4 files), and inline styles in Timeline's new-task dialog.
- **Primary buttons:** there's no single class. `wizardPrimaryBtn`, `menuLogoutBtn`, the `quick*Btn` classes and inline colors each re-create one.
- **Empty states:** "No tasks yet", "No tasks to show", "No tasks to show here." and "Nothing here — you're all caught up", with different colors (`text-muted` or `text-faint`) and spacing (`py-10` or `py-12`). Only HabitStats uses the shared `Empty` component.

**Fix:** one input class, one primary-button class, and one `<EmptyState>` with fixed copy rules.

### 8. Smaller drift

- **`title` tooltips remain** at [Menu.tsx:186](../app/assistant/components/Menu.tsx#L186) (which also sets `data-tip` at line 304), [RemindersPanel.tsx:311](../app/assistant/components/RemindersPanel.tsx#L311) and [Quick.tsx:1542](../app/assistant/components/tabs/Quick.tsx#L1542).
- **The borderless rule is only half applied.** The "remove borders" commit only touched AgendaList and Quick. HabitSection, the overdue days in Calendar and Minicalendar, and the Timeline inputs still have borders.
- **Icons are mixed.** Some buttons use text glyphs (✕ ‹ › +), TopNavBar has 22 inline SVGs and Sidebar 17, while `_icons/` holds only 9 icons.
- **The checkbox style in globals.css uses hardcoded colors** (`#4a5568`, `#3b82f6`), not the tokens behind TaskCheckmark and `panelCheckbox*`.

### 9. Names don't match

| Thing | Names in use |
|---|---|
| Main tab | Shown as "Agenda", component is `Quick` |
| AI assistant | "Octo" in its prompt, "Waldy" in the API route, "AI Chat" in the menu, `wadu-` prefix on CSS animations |
| Collaborators | Menu says "Colaborators" (typo) |
| Checklists | Menu says "Check Lists"; the panel's empty message says "No lists yet", which clashes with task lists |

### 10. Dead code

These would also break light themes if reused, because they use hardcoded grays and white text:

- **Unused components:** MainContent, SidebarCategory, SidebarItem, SidebarGroup, CollapsibleListSection, Entities and Archive.
- **Legacy components:** RemindersSection and ReminderItem are only reached through Chatbox.
- **Unused CSS in globals.css:** `.youtask-topbar*`, `.youtask-iconbtn`, `.youtask-notif*`, `.youtask-badge`, `.max-chatbox` and `.wadu-nudge-*`.
- **Unused files and packages:** [themes.json](../app/assistant/_theme/themes.json), and the `compromise` package, which only Entities.tsx uses.

## Feature ideas and upgrades

### 1. Undo and a trash bin instead of "This can't be undone"

Deleting is permanent and guarded only by confirm dialogs. Quick already keeps an undo stack, but only for checking tasks off (`CHECK_UNDO_LIMIT` in [Quick.tsx:104](../app/assistant/components/tabs/Quick.tsx#L104)). `Block` already has an `archived` field, and [Archive.tsx](../app/assistant/components/Archive.tsx) ("No tasks in trash bin") is built but never shown.

**Plan:** soft-delete, then show a shared toast with an Undo button. This also replaces the 3 separate toast implementations (Quick's GamificationToast, the toast state in Quick, and ReminderNotifier).

### 2. Reminders that fire when the tab is closed

Notifications only come from the open page ([ReminderNotifier.tsx:24](../app/assistant/components/ReminderNotifier.tsx#L24)). There's no service worker and no app manifest, so task reminders and habit `reminderTimes` are silent once the tab closes.

**Plan:** make it an installable app (manifest and service worker) and add Web Push with VAPID keys, triggered on the server.

### 3. Make Octo actually useful

The AI only receives list names plus task text and done/not-done status ([route.ts](../app/api/waldy/task/route.ts)): no due dates, flags, habits or reminders.

**Plan:** send that context and let the model create, reschedule or move tasks itself, so requests like "what's due this week?", "move everything overdue to tomorrow" or "plan my day" work.

### 4. Command palette and keyboard shortcuts

The only shortcut is `/` for search in Quick ([Quick.tsx:415](../app/assistant/components/tabs/Quick.tsx#L415)). Ctrl/Cmd+K could jump to a list, add a task, switch tabs or open a habit.

### 5. Wire up export

[lib/exportExcel.ts](../lib/exportExcel.ts) exists but nothing uses it. [CompletedReport.tsx](../app/assistant/components/CompletedReport.tsx) only prints HTML; add Excel/CSV export next to Print.

### 6. Handle being offline

TopNavBar already shows sync status, but nothing checks for a lost connection (no `navigator.onLine`) or queues changes. Today a failed save at logout only gets a `window.confirm`. Queue changes while offline and show an offline state in the sync indicator.

### 7. Loading states

Only 2 files show any loading UI, so panels pop in empty and then fill. Add skeletons matching the Agenda rows and the dashboard cards.

### 8. Collaborators

It's marked "soon" in the menu, and `assignedTo` already exists on reminders. This is the largest item here: it needs list sharing in the database, permissions and invites.

## Suggested order

1. A shared `<Modal>` and `<ConfirmDialog>`, then move every dialog to them.
2. New tokens: named z-index levels, danger/success/warning colors, and text roles.
3. Delete the override block in page.tsx and the dead code.
4. Move generic controls (switch, chips, segmented, card, empty state, input, primary button) to `components/ui/`.
5. Undo, a shared toast and the trash bin (feature 1), which builds on steps 1 and 4.
6. The other features, by priority: push reminders, Octo context and actions, the command palette, export.
