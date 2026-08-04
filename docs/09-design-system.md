# 09 — Design System

## Philosophy

The UMU Attendance System uses a **white background, Google I/O-inspired design language** —
clean surfaces, bold typography, subtle elevation, and strong use of colour for status
and action. The UMU brand colours (red and yellow, taken directly from the official crest)
are used as primary accents over Google's clean, spacious layout style.

Think: Google I/O's clarity and Material Design 3's expressiveness — but UMU-branded.

**Logo reference:** The official UMU crest features a shield with red, yellow, and black
sections, a bright yellow scroll banner, and the university name in black with red capitals.
Background is always pure white.

---

## Colour Palette

### Brand Colours (from official UMU logo)
| Name | Hex | Usage |
|---|---|---|
| UMU Red | `#CC0000` | Primary buttons, active nav, links, capital letters |
| UMU Yellow | `#F5C800` | Banner/scroll accent, highlights, badges, hover tints |
| UMU Black | `#1A1A1A` | Body text, borders, crest outline |
| UMU Red Dark | `#A30000` | Button hover, pressed states |
| UMU Yellow Light | `#FFF4B2` | Background tints, soft highlights, warning bg |

### Neutral Colours
| Name | Hex | Usage |
|---|---|---|
| White | `#FFFFFF` | Page background, card background |
| Surface | `#F8F9FA` | Section backgrounds, input backgrounds |
| Border | `#E2E8F0` | Card borders, dividers, input borders |
| Text Primary | `#1A1A2E` | Headings, body text |
| Text Secondary | `#64748B` | Subtext, labels, placeholders |
| Text Disabled | `#CBD5E1` | Disabled inputs and buttons |

### Status Colours
| Name | Hex | Usage |
|---|---|---|
| Success Green | `#16A34A` | Good attendance (>80%), success toasts |
| Success Light | `#DCFCE7` | Success badge background |
| Warning Amber | `#D97706` | Warning attendance (75–80%), warning toasts |
| Warning Light | `#FEF3C7` | Warning badge background |
| Danger Red | `#DC2626` | Not Eligible (<75%), error toasts |
| Danger Light | `#FEE2E2` | Danger badge background |
| Info Blue | `#2563EB` | Info toasts, neutral highlights |
| Info Light | `#DBEAFE` | Info badge background |

### Google I/O Inspired Surface Tokens
| Name | Hex | Usage |
|---|---|---|
| Surface 0 | `#FFFFFF` | Base page background |
| Surface 1 | `#F8F9FA` | Card, sidebar, input background |
| Surface 2 | `#F1F3F5` | Hover background, selected rows |
| Surface 3 | `#E9ECEF` | Active nav item background |

---

## Typography

**Font:** `Google Sans` (primary) + `Inter` (fallback) + `system-ui`

```css
font-family: 'Google Sans', 'Inter', system-ui, -apple-system, sans-serif;
```

For code/session codes:
```css
font-family: 'Google Sans Mono', 'Roboto Mono', 'Fira Code', monospace;
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| `display` | 48px | 700 | 1.1 | Hero text (session code display) |
| `h1` | 32px | 700 | 1.2 | Page titles |
| `h2` | 24px | 600 | 1.3 | Section headings |
| `h3` | 20px | 600 | 1.4 | Card headings |
| `h4` | 16px | 600 | 1.4 | Sub-section labels |
| `body-lg` | 16px | 400 | 1.6 | Primary body text |
| `body` | 14px | 400 | 1.6 | Default body text |
| `body-sm` | 12px | 400 | 1.5 | Captions, helper text |
| `label` | 12px | 500 | 1.4 | Form labels, table headers |
| `code` | 14px | 500 | 1.5 | Session codes, technical values |

---

## Spacing Scale (4px base grid)

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4px | Micro gaps |
| `space-2` | 8px | Inner padding small |
| `space-3` | 12px | Between inline elements |
| `space-4` | 16px | Default padding, gap |
| `space-5` | 20px | Card inner padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Large section gaps |
| `space-10` | 40px | Page section spacing |
| `space-12` | 48px | Hero/display sections |

---

## Border Radius

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 6px | Badges, small chips |
| `radius` | 10px | Buttons, inputs |
| `radius-md` | 14px | Cards |
| `radius-lg` | 20px | Modals, bottom sheets |
| `radius-full` | 9999px | Pills, avatar circles |

---

## Elevation (Shadows)

Google I/O uses subtle, layered shadows — not heavy drop shadows.

| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | Input fields, small cards |
| `shadow` | `0 4px 12px rgba(0,0,0,0.08)` | Cards, dropdowns |
| `shadow-md` | `0 8px 24px rgba(0,0,0,0.10)` | Modals, popovers |
| `shadow-lg` | `0 16px 40px rgba(0,0,0,0.12)` | Full-screen overlays |

---

## Components

### Button

Three variants:

**Primary** — UMU Red, white text
```
Background: #CC0000
Text:       #FFFFFF
Hover:      #A30000
Border:     none
Padding:    12px 24px
Radius:     10px
Font:       14px, weight 600
Min-height: 44px
```

**Secondary** — White background, red border and text
```
Background: #FFFFFF
Text:       #CC0000
Border:     1.5px solid #CC0000
Hover bg:   #FFF4F4
Padding:    12px 24px
Radius:     10px
```

**Ghost** — No background, no border, red text
```
Background: transparent
Text:       #CC0000
Hover bg:   #FFF4F4
Padding:    12px 24px
```

**Danger** — Red, for destructive actions
```
Background: #DC2626
Text:       #FFFFFF
Hover:      #B91C1C
```

All buttons:
- Minimum tap target: 44×44px
- Loading state: spinner replaces text
- Disabled: opacity 40%, cursor not-allowed
- Transition: 150ms ease

---

### Input Field

```
Background:   #F8F9FA
Border:       1.5px solid #E2E8F0
Border-focus: 1.5px solid #CC0000
Radius:       10px
Padding:      12px 16px
Font:         14px, #1A1A1A
Placeholder:  #94A3B8
Shadow-focus: 0 0 0 3px rgba(204,0,0,0.12)
```

Label above input:
```
Font: 12px, weight 500, #64748B
Margin-bottom: 6px
```

Error state:
```
Border: 1.5px solid #DC2626
Helper text: 12px, #DC2626 below input
```

---

### Card

```
Background: #FFFFFF
Border:     1px solid #E2E8F0
Radius:     14px
Padding:    20px 24px
Shadow:     0 4px 12px rgba(0,0,0,0.08)
```

Hover (interactive cards):
```
Shadow:     0 8px 24px rgba(0,0,0,0.10)
Transform:  translateY(-1px)
Transition: 200ms ease
```

---

### Badge / Status Chip

| Status | Background | Text | Border |
|---|---|---|---|
| Good ✅ | `#DCFCE7` | `#16A34A` | `#BBF7D0` |
| Warning ⚠️ | `#FEF3C7` | `#D97706` | `#FDE68A` |
| Not Eligible 🚨 | `#FEE2E2` | `#DC2626` | `#FECACA` |
| Excused 🔵 | `#DBEAFE` | `#2563EB` | `#BFDBFE` |
| Open 🟢 | `#DCFCE7` | `#16A34A` | `#BBF7D0` |
| Closed 🔴 | `#F1F5F9` | `#64748B` | `#E2E8F0` |

```
Padding:  4px 10px
Radius:   9999px (pill)
Font:     12px, weight 500
```

---

### Attendance Progress Bar

```
Track:      #E2E8F0,  height 8px, radius 9999px
Fill > 80%: #16A34A  (green)
Fill 75–80%:#D97706  (amber)
Fill < 75%: #DC2626  (red)
Animated:   width transition 600ms ease
```

---

### Session Code Display

The code shown on the lecturer's screen during a live session.
Must be readable from a distance (projector / large monitor).

```
Font:       'Google Sans Mono', monospace
Size:       72px (desktop) / 56px (mobile)
Weight:     700
Colour:     #CC0000
Tracking:   0.15em (wide letter-spacing)
Background: #FFFDF0
Border:     2px solid #F5C800 (yellow)
Radius:     20px
Padding:    24px 40px
Shadow:     0 8px 24px rgba(204,0,0,0.15)
```

---

### Toast / Alert Banner

Positioned: top-right, stacked, auto-dismiss after 4s

| Type | Left border | Icon | Background |
|---|---|---|---|
| Success | `#16A34A` | ✅ | `#FFFFFF` |
| Warning | `#D97706` | ⚠️ | `#FFFFFF` |
| Error | `#DC2626` | ❌ | `#FFFFFF` |
| Info | `#2563EB` | ℹ️ | `#FFFFFF` |

```
Width:   360px max
Radius:  10px
Shadow:  0 8px 24px rgba(0,0,0,0.12)
Padding: 14px 16px
Border:  1px solid #E2E8F0
Left:    4px solid [status colour]
```

---

### Navigation Sidebar

```
Width:        240px (desktop), hidden on mobile (drawer)
Background:   #FFFFFF
Border-right: 1px solid #E2E8F0
Shadow:       2px 0 8px rgba(0,0,0,0.04)

Logo area:    height 64px, padding 16px 20px
Nav item:     height 44px, padding 0 16px, radius 10px
Active item:  background #FFF4F4, text #CC0000, left border 3px solid #CC0000
Hover item:   background #F8F9FA
Icon:         20px, colour matches text
Font:         14px, weight 500
```

---

### Top Header Bar

```
Height:     64px
Background: #FFFFFF
Border-bottom: 1px solid #E2E8F0
Shadow:     0 1px 3px rgba(0,0,0,0.06)
Padding:    0 24px

Left:  Hamburger (mobile) + UMU badge + App name
Right: User avatar + name + role chip + logout
```

---

### Table

```
Header row:
  Background:  #F8F9FA
  Font:        12px, weight 600, #64748B, uppercase, tracking 0.05em
  Padding:     12px 16px
  Border-bottom: 2px solid #E2E8F0

Body row:
  Padding:     14px 16px
  Border-bottom: 1px solid #F1F5F9
  Font:        14px, #1A1A2E

Hover row:    background #F8F9FA
Radius:       14px (container)
Shadow:       shadow-sm
```

---

### Modal / Dialog

```
Backdrop:    rgba(0,0,0,0.45), blur 2px
Container:   white, radius 20px, padding 32px
Shadow:      0 16px 40px rgba(0,0,0,0.16)
Max-width:   480px
Animation:   scale 0.95→1.0, opacity 0→1, 200ms ease
```

---

## Page Layout

### Desktop (≥1024px)
```
┌──────────┬────────────────────────────────┐
│          │  Top Header (64px)             │
│ Sidebar  │────────────────────────────────│
│ (240px)  │                                │
│          │  Page Content                  │
│          │  Padding: 32px                 │
│          │  Max-width: 1200px             │
│          │                                │
└──────────┴────────────────────────────────┘
```

### Mobile (<1024px)
```
┌────────────────────────────────┐
│  Top Header (56px)             │
│  [☰ menu]  [UMU]  [👤]        │
├────────────────────────────────┤
│  Page Content                  │
│  Padding: 16px                 │
├────────────────────────────────┤
│  Bottom Nav (56px)             │
│  [🏠] [📋] [📊] [👤]          │
└────────────────────────────────┘
```

Bottom navigation on mobile replaces sidebar for Student and Lecturer roles.

---

## Tailwind Config Tokens

```typescript
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        umu: {
          red:         '#CC0000',
          'red-dark':  '#A30000',
          yellow:      '#F5C800',
          'yellow-light': '#FFF4B2',
          black:       '#1A1A1A',
        },
        surface: {
          0: '#FFFFFF',
          1: '#F8F9FA',
          2: '#F1F3F5',
          3: '#E9ECEF',
        }
      },
      fontFamily: {
        sans: ['Google Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Google Sans Mono', 'Roboto Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '10px',
        md:  '14px',
        lg:  '20px',
      },
      boxShadow: {
        sm:  '0 1px 3px rgba(0,0,0,0.06)',
        DEFAULT: '0 4px 12px rgba(0,0,0,0.08)',
        md:  '0 8px 24px rgba(0,0,0,0.10)',
        lg:  '0 16px 40px rgba(0,0,0,0.12)',
      }
    }
  }
}
```

---

## Google Font Import

Add to `client/index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;600;700&family=Google+Sans+Mono:wght@400;500&display=swap" rel="stylesheet">
```

> Note: Google Sans is available via Google Fonts for web use.
> Fallback to Inter if it fails to load.

---

## PWA Manifest Colours

```json
{
  "name": "UMU Attendance",
  "short_name": "UMU Attend",
  "theme_color": "#CC0000",
  "background_color": "#FFFFFF",
  "display": "standalone"
}
```
