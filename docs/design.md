# Arc90 — Design System

> Version 2.0 · June 2026
> Direction: Editorial monochrome. Glass surfaces. No purple gradients. No emojis.
> References: Health Dashboard Dark Interface (dark) · Codero Management UI (light)

---

## Color tokens

### Dark mode (default)
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#080808` | App background |
| `--bg-2` | `#101010` | Subtle secondary bg |
| `--card` | `rgba(255,255,255,0.04)` | Glass card surface |
| `--card-2` | `rgba(255,255,255,0.07)` | Elevated glass surface |
| `--line` | `rgba(255,255,255,0.07)` | Hairline borders |
| `--line-2` | `rgba(255,255,255,0.13)` | Active/hover borders |
| `--tx` | `#f0f0f0` | Primary text |
| `--tx-2` | `rgba(240,240,240,0.50)` | Secondary text |
| `--tx-3` | `rgba(240,240,240,0.30)` | Tertiary / labels |
| `--accent` | `#f0f0f0` | Primary accent (white) |
| `--accent-2` | `#c0c0c0` | Secondary accent |
| `--accent-3` | `#808080` | Muted accent |
| `--accent-soft` | `rgba(255,255,255,0.06)` | Accent fill |
| `--accent-line` | `rgba(255,255,255,0.14)` | Accent border |
| `--grad` | `linear-gradient(135deg, #d0d0d0, #ffffff)` | Progress ring |

### Light mode
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#f2f2f2` | App background |
| `--bg-2` | `#fafafa` | Subtle secondary bg |
| `--card` | `rgba(255,255,255,0.68)` | Glass card surface |
| `--card-2` | `rgba(255,255,255,0.88)` | Elevated glass surface |
| `--line` | `rgba(0,0,0,0.07)` | Hairline borders |
| `--line-2` | `rgba(0,0,0,0.13)` | Active/hover borders |
| `--tx` | `#111111` | Primary text |
| `--tx-2` | `rgba(17,17,17,0.50)` | Secondary text |
| `--tx-3` | `rgba(17,17,17,0.32)` | Tertiary / labels |
| `--accent` | `#111111` | Primary accent (black) |
| `--accent-2` | `#333333` | Secondary accent |
| `--accent-3` | `#666666` | Muted accent |
| `--accent-soft` | `rgba(0,0,0,0.05)` | Accent fill |
| `--accent-line` | `rgba(0,0,0,0.12)` | Accent border |
| `--grad` | `linear-gradient(135deg, #444444, #111111)` | Progress ring |

### Semantic (both modes)
| Token | Dark | Light | Role |
|-------|------|-------|------|
| `--mint` | `#3ecf8e` | `#1a8f6f` | Success / complete |
| `--red` | `#f25c75` | `#d24763` | Miss / alert |
| `--amber` | `#ffbd6b` | `#c48a1a` | Warning / partial |

---

## Surfaces

### Glass card
```
background: var(--card)
border: 1px solid var(--line)
border-radius: 20px
backdrop-filter: blur(16px) saturate(180%)
-webkit-backdrop-filter: blur(16px) saturate(180%)
box-shadow: var(--card-edge), var(--shadow)
```

### Card hierarchy
- **Level 0** — `--bg`: raw background, no surface
- **Level 1** — `--card`: primary glass card, main content
- **Level 2** — `--card-2`: elevated surface, inputs, inner panels
- **Level 3** — `--line`: hairline separator only

---

## Typography
- **Font:** -apple-system / SF Pro Text (native system font)
- **Heading XL:** 28px / 900 weight / -0.02em tracking
- **Heading L:** 22px / 800 weight / -0.01em tracking
- **Heading M:** 17px / 700 weight
- **Body:** 15px / 400 weight / 1.45 line-height
- **Label:** 11px / 700 weight / 0.08em tracking / uppercase
- **Number XL:** 42px / 800 weight / -0.03em tracking (momentum score, streaks)

---

## Spacing & radius
- `--r-lg`: 20px (cards)
- `--r-md`: 14px (inner elements)
- `--r-sm`: 10px (chips, badges)
- Screen padding: 18px horizontal
- Card padding: 18px
- Stack gap: 12px between cards

---

## Motion
- Spring: `cubic-bezier(0.34, 1.45, 0.5, 1)`
- Standard: `cubic-bezier(0.2, 0.8, 0.2, 1)` at 340ms
- Micro: 150ms ease

---

## Rules
- No purple, violet, or cyan-to-purple gradients anywhere
- No emojis in UI
- All cards: transparent glass with backdrop-filter
- Progress ring: white (dark) / near-black (light) — single clean gradient
- Functional colors only: mint=complete, red=miss, amber=partial/warning
- Background: no decorative radial blobs — just clean dark/light field
