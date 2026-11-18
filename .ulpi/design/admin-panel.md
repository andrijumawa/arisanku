# Admin Panel Design Specification

## Design Read

Use the locked ArisanKu Swiss / grid language as a quiet review desk: the administrator should see where work is, what needs attention, and what is empty without mistaking decoration for status.

**Identity lock:** Every screen must read as the same product if placed side by side.

## Scope and evidence

- Target: authenticated ArisanKu administrators, primarily using Android phones; the panel is also used on narrow and wide browser viewports.
- Goal: review pending registrations and payments, manage groups, and review participants.
- Existing entry: Menu tile “Admin” routes to `/admin`; tab selection is kept in `?tab=...`.
- Reference input: no external links. The supplied mobile screenshot is the visual baseline.
- Preserve all existing Supabase queries, realtime refresh behavior, actions, confirmation prompts, and routes.
- Bind all styling and values to `.ulpi/design/DESIGN.md`. Do not add colors, typefaces, radii, or motion outside its tokens.

## Direction and composition

The page is an administration register, not a marketing dashboard. Avoid a large hero, decorative metric cards, and a second navigation metaphor.

1. A compact, left-aligned page heading anchors the screen. “Panel Admin” is the sole heading. A small tools icon sits in a tinted square aligned to the heading. Do not add an eyebrow/kicker or explanatory paragraph that competes with the heading.
2. The category selector is a single-width segmented register index. The selected tab gets the signature cobalt rule and a very light accent surface; unselected tabs stay quiet and legible. No floating pill row.
3. Content starts directly below the selector. Pending records use a flat, aligned list/card pattern with consistent person and group information; avoid nested cards.
4. An empty queue is a compact, opaque white/cool-surface panel with one icon, a direct status sentence, and optional short supporting line. Vertically center it only within a modest bounded region, not across the whole screen.
5. Loading and errors occupy the same content region to avoid layout jumps.

## Flow: Reviewing Admin Work

### Goal and user story

As an administrator, I want to switch between pending registrations, payments, groups, and participants so I can review work quickly and understand the current state.

### Flow

```text
Menu → Admin panel → choose a category → loading / records / empty / error
                                    └→ action → confirm or submit → refreshed list / toast
```

### State model

| State | Required behavior |
|---|---|
| Initial counts loading | Keep the heading and tab geometry stable; show a compact spinner only in the relevant content region. |
| Queue loading | Keep tabs enabled; show a bounded loading indicator beneath them. Do not render a success-shaped empty state while loading. |
| Populated registrations | Show participant identity, phone, submission date, group summary, and approve/reject actions. Keep destructive action visually secondary. |
| Populated payments | Show participant identity, amount, group/period/date, proof image, and approve/reject actions. Preserve proof-image behavior. |
| Groups | Keep “Kelompok baru” as the single primary action, then show group rows with type, contribution, period, count, and open/closed state. |
| Participants | Keep search, result count, identity, verification status, role, and relevant actions. |
| Empty registration/payment queue | Use direct copy, e.g. “Tidak ada pendaftaran menunggu” or “Tidak ada pembayaran menunggu”; show check icon and compact supporting copy only when useful. |
| Empty groups | Keep “Kelompok baru” visible and explain that no groups exist yet. |
| Empty search result | Say no participant matches the search; keep the query in the field and allow editing. |
| Error | Show the repository-standard error message and “Coba lagi”; retain the selected category and other state. |
| Pending action | Disable only the action row for the affected record, preserve busy feedback, and avoid duplicate submissions. |
| Success | Preserve toast and realtime refresh behavior; removed/reviewed records leave their pending queue. |
| Confirmation / cancellation | Preserve existing confirmation and prompt semantics. Cancel leaves record and selection unchanged. |
| Session expired / permission lost | Follow existing auth routing and surface the existing error; never render admin data optimistically. |
| Offline / refresh | Keep URL as source of selected tab; reload re-enters that tab and shows loading before data. No local write queue is introduced. |

### URL and interaction state

- Valid URL values remain `daftar`, `bayar`, `kelompok`, and `peserta`; the existing default remains `daftar`.
- Selecting a tab updates the existing query parameter and remains compatible with browser back/forward.
- Unknown tab query values resolve safely to the established default without altering fetched data behavior.
- Counts remain live Supabase-derived counts; no placeholder or fabricated values.

## Component: Admin Page Heading

### Purpose

Identify the admin workspace and orient the user without taking space from the review queue.

### Visual contract

- Use one compact heading row, left aligned.
- Heading text is `Panel Admin`, 21px maximum and fluid down to 19px, semibold/bold.
- Tools icon sits in a 44–46px square using the same blue gradient, white icon, translucent white border, radius, and tinted shadow as icons in Menu tiles.
- No extra kicker, decorative badge, gradient text, or subtitle.
- Align to existing main content inset; do not extend into viewport gutters.

### Responsive and states

- At 360px wide, heading remains one row; icon may reduce to 40px and heading wraps only if needed.
- At tablet/desktop, content is constrained to the existing readable app width; do not stretch the heading.
- No interactive state. Icon is decorative and `aria-hidden`.

## Component: Admin Category Tabs

### Purpose

Switch the review content while exposing the selected category and its pending count.

### Variants and data

- Four tabs: `Pendaftaran`, `Pembayaran`, `Kelompok`, `Peserta`.
- Place one 17px existing-family icon before each label: inbox for Pendaftaran, coin for Pembayaran, folder for Kelompok, users for Peserta. Icons inherit tab text color and are decorative to screen readers; the accessible tab label remains text plus any count.
- Only Pendaftaran, Pembayaran, and Peserta show a count when the live value is greater than zero.
- All four tab cells and the content panel use the exact opaque Menu tile surface token (`linear-gradient(145deg, #fff, #f0f5ff)`). Selected state is identified by its accent left rule, accent text, and weight, not a different fill. Pending count may use the locked warning semantic tokens.
- Unselected tabs use muted text and a quiet surface. Do not style every category as a separate colored button.

### Interaction and accessibility

- Implement Radix UI Tabs, controlled by and synchronized with the existing URL query parameter.
- Use semantic tablist, tab, and tabpanel. `aria-selected`/`aria-controls` are managed by Radix.
- Arrow keys move between tabs; Home/End reach first/last; Enter/Space activate in manual activation mode.
- Preserve visible keyboard focus at ≥3:1 contrast; do not remove outlines.
- Tab target minimum height 44px, preferably 48px.
- Announce category count as part of the tab label, e.g. “Pendaftaran, 2 menunggu”. A zero/absent count is not announced as a fake pending value.
- Keep all four choices visible without horizontal clipping. At <560px use a 2×2 grid; at ≥560px use four equal columns if each label remains on one line. If actual container width cannot fit all four, allow labels to wrap within equal-height tabs rather than crop or silently hide a tab.
- Preserve horizontal reading/keyboard order: Pendaftaran, Pembayaran, Kelompok, Peserta.

### States

| State | Visual and behavior |
|---|---|
| Default | quiet neutral surface, muted label |
| Selected | accent-soft surface, narrow accent rule, bold accent text |
| Pending count | semantic warning chip; never use the chip as the only indication of count |
| Hover | subtle surface shift only |
| Focus | visible accent outline |
| Pressed | restrained 0.98 scale or surface feedback |
| Disabled | not used; category navigation remains available during content loading |

## Component: Admin Content Region

### Purpose

Present the selected category's work in a stable region under the tabs.

### Layout

- One content region, full available width, min-width 0.
- No nested cards. Work item surfaces use the shared opaque card surface and restrained border/shadow from the design lock.
- Mobile page uses the existing `.main` vertical scrolling; do not force content into a fixed viewport height.
- On desktop, constrain to existing application width and use a modest maximum width; keep action controls reachable.
- Never let the shared bottom “Kembali ke Menu” footer obscure actions or proof images.

### Empty state

- Opaque surface `#ffffff` / `#f7f9ff`, one-pixel locked border, radius from the design lock.
- Compact vertical padding 24–32px; not an oversized blank page hero.
- Check/folder/search icon in a 48–54px accent-soft bed, decorative to screen readers when the status heading already explains it.
- Heading 15–16px semibold; supporting copy at 13px, max 34ch, muted.
- No generic motivational language or CTA unless the category actually has an action (Groups keeps “Kelompok baru” above the empty state).

### Loading and error

- Reserve the same bounded content area as the empty state.
- Spinner has descriptive accessible text; do not announce repeated animation.
- Error card keeps the existing error text and retry action; retry button has visible focus and minimum 44px target.

## Accessibility and responsive acceptance

- WCAG AA: `#263248` on `#c9d6ff` 8.91:1; `#667085` on white 4.97:1; white on accent `#3f5eac` 6.16:1; accent on `#e8efff` 5.35:1; warning `#72500c` on `#fff1d2` 6.54:1.
- Touch targets are at least 44px in both dimensions, with 48px preferred for tabs/actions.
- All functionality works with keyboard and touch; no hover-only meaning.
- Motion is limited to 120–240ms state feedback and disabled/reduced under `prefers-reduced-motion`.
- Test widths 320, 360, 390, 430, 560, 768, and 1024px; verify no horizontal page overflow, clipped labels, or footer overlap.
- Test browser zoom at 200%; controls remain usable and labels do not overlap.

## Design Pre-Flight

### Identity and anti-slop

- [x] Screen binds to the locked ArisanKu tokens; no new typeface or accent.
- [x] Swiss / grid is brief-specific: a work-register index is used to navigate real review queues.
- [x] Signature is singular: one active register rule, not many simultaneous decorative effects.
- [x] No nested cards, three-up dashboard cards, gradients on text, generic glass surfaces, or marketing hero.
- [x] Visible copy is plain Indonesian; no fabricated data, buzzwords, or em-dash.

### State and accessibility

- [x] Loading, empty, populated, error, pending action, success, cancel, expiry, refresh, and offline behavior are documented.
- [x] Keyboard model and semantic tab behavior are explicit.
- [x] WCAG AA pairings and touch target sizes are recorded.
- [x] Reduced motion is respected.

### Layout and cognitive load

- [x] Distinct layout families: compact heading row, register navigation, record list, bounded empty/loading/error region.
- [x] Four top-level choices remain within the working-memory limit.
- [x] One primary action per relevant view; destructive action remains secondary.

### Scored self-critique (0–4)

| Axis | Score |
|---|---:|
| Distinctiveness | 3 |
| Hierarchy and focus | 4 |
| Consistency with DESIGN.md | 4 |
| Accessibility | 4 |
| State and edge coverage | 4 |
| Copy quality | 4 |
| Restraint | 4 |
| Motion motivation | 3 |
| **Total** | **30 / 32** |

No axis is ≤2. The mobile tab grid is the main tradeoff: it is denser than a horizontal rail, but preserves all four admin tasks without clipping or hidden navigation on narrow screens.

## Build handoff

- **Target agent:** `react-vite-tailwind-engineer` equivalent; implement with the available React/Vite/CSS stack.
- **Files:** `src/pages/admin/AdminHome.jsx`, `src/styles.css`; update only directly related tests if present.
- **Design system:** Radix UI Tabs. Add only the Tabs primitive dependency if it is not already available; do not run the shadcn CLI or add a new CSS framework. Theme it with the locked tokens; do not re-implement its tab semantics.
- **Behavior boundary:** preserve the existing Supabase queries, realtime refresh, query-string tab selection, review actions, toasts, and shared layout.
- **Instruction:** Implement exactly this spec. Theme the design system with our locked tokens; do NOT redesign or re-implement its components.
- **Acceptance criteria:**
  - [ ] Heading is compact and clear with no filler kicker/subtitle.
  - [ ] Four tabs fit at every specified viewport and preserve query-string/back-forward behavior.
  - [ ] Radix keyboard and screen-reader tab semantics work.
  - [ ] The empty queue is a modest opaque panel, not a large floating message on the canvas.
  - [ ] Populated lists, search, actions, counts, errors, and realtime updates preserve behavior.
  - [ ] No card surface color is changed by the watermark behind it.
  - [ ] No clipped controls, horizontal page overflow, or overlap with the shared footer at tested widths.
  - [ ] `npm run build` and `git diff --check` pass.
