---
project: ArisanKu
register: product
aesthetic_direction: Swiss / grid
color_strategy: restrained
design_system: Radix UI Tabs + existing CSS tokens
design_variance: 5
motion_intensity: 2
visual_density: 4
---

# ArisanKu design language

## Design Read

Calm and dependable, with the clarity of a well-kept savings register; use disciplined alignment to make shared-money administration feel transparent.

The brief-specific bet is a ledger index: one precise cobalt rule identifies the current work area, while clear counts and compact records do the rest. This is not a generic dashboard treatment because the signature is borrowed from the actual task of sorting and reviewing arisan records.

## Signature

The active category has a narrow cobalt register rule and a quiet tinted surface. It communicates the current review queue without turning every control into a pill or adding decorative dashboard cards.

## Color (locked)

Use the existing ArisanKu periwinkle canvas and pale surfaces as product identity. Keep work surfaces opaque so the global watermark never changes card color. Use one operational accent, dark cobalt, for selected actions and focus.

| role | OKLCH | hex | use |
|---|---|---|---|
| background | `oklch(0.880 0.059 271.333)` | `#c9d6ff` | app canvas |
| surface | `oklch(1.000 0.000 89.876)` | `#ffffff` | cards and controls |
| elevated | `oklch(0.982 0.008 271.330)` | `#f7f9ff` | inset work areas |
| muted surface | `oklch(0.952 0.023 266.909)` | `#e8efff` | selected tab and icon beds |
| border | `oklch(0.906 0.031 265.325)` | `#d6e0f5` | separators and outlines |
| text | `oklch(0.317 0.043 262.142)` | `#263248` | titles and primary content |
| muted text | `oklch(0.544 0.035 265.114)` | `#667085` | supporting copy |
| accent | `oklch(0.499 0.130 265.632)` | `#3f5eac` | selected state, primary actions, focus |
| accent pressed | `oklch(0.444 0.118 265.743)` | `#344f94` | pressed primary action; white contrast 7.80:1 |
| accent-soft | `oklch(0.621 0.150 267.639)` | `#5f80e0` | existing brand tint and non-text decoration only |
| success | `oklch(0.560 0.133 153.097)` | `#1d8a4d` | success icon / non-text indicator |
| success text | `oklch(0.418 0.108 153.100)` | `#176a3c` | text on `#e4f5ea` |
| success surface | `oklch(0.955 0.023 157.594)` | `#e4f5ea` | success state |
| warning | `oklch(0.457 0.090 78.513)` | `#72500c` | warning text and icon |
| warning surface | `oklch(0.961 0.043 86.590)` | `#fff1d2` | pending count bed |
| danger | `oklch(0.516 0.167 28.040)` | `#b4332b` | destructive actions |
| danger surface | `oklch(0.948 0.020 25.173)` | `#fbe9e7` | error state |
| info | `oklch(0.499 0.130 265.632)` | `#3f5eac` | informational state |
| info surface | `oklch(0.952 0.023 266.909)` | `#e8efff` | informational state |

Contrast checks (WCAG 2.2): text `#263248` on canvas `#c9d6ff` 8.91:1; text on white 12.87:1; muted `#667085` on white 4.97:1; white on accent `#3f5eac` 6.16:1; accent on `#e8efff` 5.35:1; warning `#72500c` on `#fff1d2` 6.54:1; danger on `#fbe9e7` 5.19:1; success text `#176a3c` on `#e4f5ea` 5.86:1. State colors are reserved for semantic meaning and are not additional brand accents.

Target visual weight: 60% calm canvas and whitespace, 30% opaque white / cool-tinted work surfaces, 10% accent and semantic state color.

## Type (locked)

| role | family | use | notes |
|---|---|---|---|
| display | Poppins | page and section headings | 600–700; compact, restrained tracking |
| body | Poppins | controls, labels, supporting copy | 400–600; Indonesian sentence case |
| utility | Poppins | counts, dates, status labels | 500–700; tabular numerals where numeric alignment matters |

Use the existing Poppins Google Fonts link in `index.html`; do not add a second typeface or rely on browser defaults as the intended face. Headings wrap naturally; avoid all-caps except short established labels.

## Scales (locked)

- `spacing`: 4px base rhythm; use 4, 8, 12, 16, 20, 24, 32, 40px.
- `radius`: `sm 8px`, `md 12px`, `lg 16px`, `xl 20px`, `full 9999px`. Use larger radii only for large app surfaces, not every control.
- `shadow`: low-opacity cool-tinted shadow, used only to indicate elevation; separators are preferred for adjacent records.
- `z-index`: `base 0`, `dropdown 20`, `sticky 30`, `fixed 40`, `modalBackdrop 45`, `modal 50`, `popover 60`, `toast 70`, `skipLink 80`.
- `motion`: fast 120ms, base 240ms, emphasis 360ms; easing `cubic-bezier(0.2, 0.7, 0.2, 1)`. No bounce. Honor `prefers-reduced-motion`.
- `breakpoints`: compact mobile `360px`, mobile `480px`, tablet `768px`, desktop `1024px`. Use fluid sizing between breakpoints.
- Touch targets: minimum 44 CSS px, targeting 48 CSS px for primary touch controls.

## Voice

`register`: plain, warm, confident Indonesian. `action vocabulary`: “Setujui”, “Tolak”, “Coba lagi”, and “Kembali ke Menu”. State messages describe the actual queue or action; avoid celebratory filler and exclamation marks.

## System and implementation boundary

Use Radix UI Tabs for accessible tab semantics and keyboard behavior, styled with this project's CSS tokens. Preserve current React/Vite, URL query state, Supabase data behavior, shared layout, and existing icon family. Do not introduce a component framework, design-system CLI, or additional visual vocabulary.

## Consistency lock

Every screen must read as the same product if placed side by side.
