# 09 — Design System

## Philosophy

White background, **Google I/O-inspired** design language — clean surfaces, bold typography,
borders instead of shadows, strong colour use for status and action. UMU brand colours
(red and yellow from the official crest) are used as primary accents.

**Fonts:** Google Sans (primary), Inter (fallback), Google Sans Mono (code/session codes).

---

## Colour Palette

### Brand Colours (from official UMU crest)
| Token | Hex | Usage |
|---|---|---|
| `umu-red` | `#CC0000` | Primary buttons, active nav, links |
| `umu-red-dark` | `#A30000` | Button hover/pressed |
| `umu-yellow` | `#F5C800` | Accents, highlights |
| `umu-yellow-light` | `#FFF4B2` | Yellow tint backgrounds |
| `umu-black` | `#1A1A1A` | Strong text, borders |

### Surface Tokens
| Token | Hex | Usage |
|---|---|---|
| `surface-0` | `#FFFFFF` | Page background |
| `surface-1` | `#F8F9FA` | Cards, sidebar, input background |
| `surface-2` | `#F1F3F5` | Hover states, selected rows, role chips |
| `surface-3` | `#E9ECEF` | Deeper section backgrounds |
| `border` | `#E2E8F0` | All borders and dividers |
| `text-primary` | `#1A1A2E` | Headings, body text |
| `text-secondary` | `#64748B` | Subtext, labels, placeholders |
| `text-disabled` | `#CBD5E1` | Disabled elements |

### Status Colours
| Token | Hex | Light Bg | Border | Usage |
|---|---|---|---|---|
| `success` | `#16A34A` | `#DCFCE7` | `#BBF7D0` | Good attendance, open session, success toast |
| `warning` | `#D97706` | `#FEF3C7` | `#FDE68A` | Warning attendance, open session notice |
| `danger` | `#DC2626` | `#FEE2E2` | `#FECACA` | Not eligible, error toast, danger actions |
| `info` | `#2563EB` | `#DBEAFE` | `#BFDBFE` | Excused status, info toast |

---

## Typography

```css
font-family: 'Google Sans', 'Inter', system-ui, -apple-system, sans-serif;
/* Code / session codes */
font-family: 'Google Sans Mono', 'Roboto Mono', 'Fira Code', monospace;
```

### Type Scale

| Token | Size | Weight | Usage |
|---|---|---|---|
| `display` | 48px / 700 | Session code display on live screen |
| `h1` | 32px / 700 | Page titles |
| `h2` | 24px / 600 | Section headings |
| `h3` | 20px / 600 | Card headings |
| `h4` | 16px / 600 | Sub-section labels |
| `body-lg` | 16px / 400 | Primary body text |
| `body` | 14px / 400 | Default body text |
| `body-sm` | 12px / 400 | Captions, helper text |
| `label` | 12px / 500 | Form labels, table headers (uppercase) |

---

## Spacing (4px base grid)

| Token | Value |
|---|---|
| `space-1` | 4px |
| `space-2` | 8px |
| `space-3` | 12px |
| `space-4` | 16px |
| `space-5` | 20px |
| `space-6` | 24px |
| `space-8` | 32px |
| `space-10` | 40px |
| `space-12` | 48px |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Tags, small chips |
| `radius` | 10px | Buttons, inputs, nav items |
| `radius-md` | 14px | Cards |
| `radius-lg` | 20px | Modals |
| `radius-full` | 9999px | Badges/pills, avatar circles, progress bars |

---

## Elevation (Shadows)

Google I/O style: borders for structure, shadows only for floating elements.

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | Small cards |
| `shadow` | `0 4px 12px rgba(0,0,0,0.08)` | Cards, dropdowns |
| `shadow-md` | `0 8px 24px rgba(0,0,0,0.10)` | Modals, popovers |
| `shadow-lg` | `0 16px 40px rgba(0,0,0,0.12)` | Full-screen overlays |
| `focus-red` | `0 0 0 3px rgba(204,0,0,0.12)` | Input focus rings |

---

## Components

### Button

**Primary** — UMU Red, white text
```
bg: #CC0000 · text: #FFFFFF · hover: #A30000
padding: 12px 24px · radius: 10px · min-height: 44px · font: 14px/600
```

**Secondary** — white bg, red border + text
```
bg: #FFFFFF · text: #CC0000 · border: 1.5px solid #CC0000
hover bg: #FFF4F4
```

**Ghost** — transparent, red text
```
bg: transparent · text: #CC0000 · hover bg: #FFF4F4
```

**Danger** — red bg, white text (destructive actions)
```
bg: #DC2626 · text: #FFFFFF · hover: #B91C1C
```

All buttons:
- Min tap target: 44×44px
- Loading: spinner replaces text, disabled during load
- Disabled: 40% opacity, not-allowed cursor
- Transition: 150ms

---

### Input Field

```
bg: #F8F9FA · border: 1.5px solid #E2E8F0 · radius: 10px
padding: 12px 16px · font: 14px · placeholder: #94A3B8
focus border: #CC0000 · focus shadow: focus-red
```

Label: 12px/500, `#64748B`, margin-bottom 6px

Error state: border `#DC2626`, helper text `#DC2626` below input

---

### Card

```
bg: #FFFFFF · border: 1px solid #E2E8F0 · radius: 14px
padding: 20px (default) · can be noPadding for full-width tables
```

---

### Badge / Status Pill

```
padding: 4px 10px · radius: 9999px · font: 12px/500
```

| Status | Bg | Text | Border |
|---|---|---|---|
| good / open / present | `#DCFCE7` | `#16A34A` | `#BBF7D0` |
| warning | `#FEF3C7` | `#D97706` | `#FDE68A` |
| critical / not_eligible | `#FEE2E2` | `#DC2626` | `#FECACA` |
| excused / info | `#DBEAFE` | `#2563EB` | `#BFDBFE` |
| closed / absent / default | `#F1F5F9` | `#64748B` | `#E2E8F0` |

---

### Attendance Progress Bar

```
Track: #E2E8F0, height 8px, radius 9999px
Fill > 80%:   #16A34A (green)
Fill 75–80%:  #D97706 (amber)
Fill < 75%:   #DC2626 (red)
Transition: width 600ms ease
```

---

### Session Code Display (Live Screen)

The most prominent element in the app — readable from across a classroom.

```
Font:       Google Sans Mono, monospace
Size:       72px desktop / 56px mobile
Weight:     700
Colour:     #CC0000
Tracking:   0.15em
Background: #FFFDF0
Border:     2px solid #F5C800
Radius:     20px
Padding:    24px 40px
Shadow:     0 8px 24px rgba(204,0,0,0.15)
```

---

### Toast / Alert Banner

Top-right, stacked, auto-dismiss after 4 seconds.

```
Width: 360px max · radius: 10px · padding: 14px 16px
border: 1px solid #E2E8F0 · left: 4px solid [status colour]
shadow: 0 8px 24px rgba(0,0,0,0.12)
```

Types: success (green) · warning (amber) · error (red) · info (blue)

---

### Navigation — Desktop Sidebar

```
Width: 240px · bg: #FFFFFF · border-right: 1px solid #E2E8F0

Logo area:    h-16, padding 16px 20px
Nav item:     h-11, padding 0 16px, radius 10px, 14px/500
Active item:  bg #FFF4F4, text #CC0000
Hover item:   bg #F8F9FA
Icon:         20px, colour matches text
```

---

### Navigation — Mobile Bottom Bar (Student + Lecturer)

```
Height: 64px + env(safe-area-inset-bottom)
bg: #FFFFFF · border-top: 1px solid #E2E8F0
Position: fixed, bottom 0, inset-x 0
z-index: 40

Tab item:   flex-1, flex-col, items-center, gap 0.5
Active tab: text #CC0000, icon pill bg #FFF4F4
Inactive:   text #64748B
Font:       11px/500

Uses NavLink — active state driven by current route.
```

---

### Top Header Bar

```
Height: 64px desktop / 56px mobile
bg: #FFFFFF · border-bottom: 1px solid #E2E8F0
padding: 0 24px desktop / 0 16px mobile

Mobile left:  UMU logo + "UMU Attendance" (bold)
Desktop left: faculty name or role label

Desktop right: full name + email + role chip + "Logout" text button
Mobile right:  logout icon button only
```

---

### Modal

```
Backdrop: rgba(0,0,0,0.45), blur 2px
Container: white, radius 20px, padding 32px, max-width 480px
Shadow: 0 16px 40px rgba(0,0,0,0.16)
Animation: scale 0.95→1.0, opacity 0→1, 200ms ease
```

---

### Table

```
Header: bg #F8F9FA, font 12px/600/#64748B uppercase, padding 12px 16px
Rows: padding 14px 16px, border-bottom 1px solid #F1F5F9
Hover row: bg #F8F9FA
Container: radius 14px, overflow-x-auto (horizontal scroll on narrow screens)
```

---

## Page Layout

### Desktop (≥768px)
```
┌──────────┬────────────────────────────────┐
│          │  Top Header (64px)             │
│ Sidebar  │────────────────────────────────│
│ (240px)  │  Page Content                  │
│          │  Padding: 32px                 │
│          │  Max-width: 1200px             │
└──────────┴────────────────────────────────┘
```

### Mobile (<768px) — Student & Lecturer
```
┌────────────────────────────────┐
│  Top Header (56px)             │
├────────────────────────────────┤
│  Page Content                  │
│  Padding: 16px                 │
│  Padding-bottom: 96px          │  ← clears bottom nav
├────────────────────────────────┤
│  Bottom Nav (64px + safe area) │
└────────────────────────────────┘
```

### Mobile (<768px) — Faculty Admin & System Admin
```
┌────────────────────────────────┐
│  [Monitor icon]                │
│  Desktop required              │
│  The Faculty Admin portal is   │
│  designed for larger screens.  │
│  [UMU logo]                    │
└────────────────────────────────┘
```

---

## Tailwind Config (actual `tailwind.config.ts`)

```typescript
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        umu: {
          red:            '#CC0000',
          'red-dark':     '#A30000',
          yellow:         '#F5C800',
          'yellow-light': '#FFF4B2',
          black:          '#1A1A1A',
        },
        surface: { 0: '#FFFFFF', 1: '#F8F9FA', 2: '#F1F3F5', 3: '#E9ECEF' },
        border:           '#E2E8F0',
        'text-primary':   '#1A1A2E',
        'text-secondary': '#64748B',
        'text-disabled':  '#CBD5E1',
        success: { DEFAULT: '#16A34A', light: '#DCFCE7', border: '#BBF7D0' },
        warning: { DEFAULT: '#D97706', light: '#FEF3C7', border: '#FDE68A' },
        danger:  { DEFAULT: '#DC2626', light: '#FEE2E2', border: '#FECACA' },
        info:    { DEFAULT: '#2563EB', light: '#DBEAFE', border: '#BFDBFE' },
      },
      fontFamily: {
        sans: ['Google Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Google Sans Mono', 'Roboto Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        display:   ['48px', { lineHeight: '1.1', fontWeight: '700' }],
        h1:        ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        h2:        ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        h3:        ['20px', { lineHeight: '1.4', fontWeight: '600' }],
        h4:        ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        body:      ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-lg': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        label:     ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        code:      ['14px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '10px', sm: '6px', md: '14px', lg: '20px', full: '9999px',
      },
      boxShadow: {
        sm:          '0 1px 3px rgba(0,0,0,0.06)',
        DEFAULT:     '0 4px 12px rgba(0,0,0,0.08)',
        md:          '0 8px 24px rgba(0,0,0,0.10)',
        lg:          '0 16px 40px rgba(0,0,0,0.12)',
        'focus-red': '0 0 0 3px rgba(204,0,0,0.12)',
      },
    },
  },
  plugins: [],
}
```

---

## PWA Manifest (`vite.config.ts` → `manifest.webmanifest`)

```json
{
  "name": "UMU Attendance",
  "short_name": "UMU Attend",
  "description": "Attendance management system for Uganda Martyrs University",
  "theme_color": "#CC0000",
  "background_color": "#FFFFFF",
  "display": "standalone",
  "start_url": "/",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`maskable` on the 512px icon fills Android adaptive icon shapes without white padding.
