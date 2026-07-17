# Arc90 — Design Language v4: "Obsidian Bento"

> Version 4.0 · July 2026 · Supersedes design.md (v2 "Editorial Monochrome")
> Direction: Luxury-watch obsidian. Bento composition. Big numerals, glanceable density.
> Tokens are authoritative in `css/styles.css` (`:root` mono + `[data-theme="dark"]` "Gold").
> The owner runs **Gold** (`--accent: #e3c27d`). Everything below works in both.

Obsidian Bento turns every screen into a **2-column bento grid** built from exactly **three card sizes** — HERO, HALF, STRIP. Composition carries the interest; the obsidian field and one warm accent carry the mood. No decoration does any work.

---

## 1. Principles

1. **Composition over minimalism.** Interest comes from the bento rhythm — mixed card widths, one big focal object — not from empty space or ornament. A screen is never a monotonous stack of same-width cards.
2. **One hero per screen.** Exactly one HERO carries the screen's single ring or headline number. Everything else supports it. Two heroes = no hero.
3. **Data-dense, decoration-free.** Whoop/Oura glanceability: numbers, meters, states. No illustrative fluff, no filler copy, no kicker badges.
4. **Accent lives in hairlines, text, and meters — never in fills.** The champagne/silver accent draws the "90", meter fills, state words, and 1px borders. Large accent-colored fills are forbidden.
5. **Motion is physical, not decorative.** Two moves only: a **spring press** on tap, and a **push** between rooms/tabs. Nothing floats, pulses, or shimmers for its own sake.

---

## 2. Grid & Spacing

The screen is a mobile column, `max-width: 460px`, centered.

| Property | Value | Notes |
|---|---|---|
| Grid | `grid-template-columns: repeat(2, minmax(0,1fr))` | The bento. Every screen. |
| Gap | **11px** | Both axes. The grid owns *all* inter-card spacing. |
| Screen padding | `calc(14px + safe-area-top) 18px calc(46px + safe-area-bottom)` | 18px side gutters; bottom clears the tab bar. |

**Card padding scale**

| Card | Padding | Radius |
|---|---|---|
| HERO | 18px (20px if it holds a ring) | `--r-lg` (24px) |
| HALF | 14px | `--r-lg` (24px) |
| STRIP | 12–14px | `--r-lg` (24px) |
| Inner meters / inputs / rows | 10–13px | `--r-md` (18px) |
| Chips / badges / pills | 6–10px | `--r-sm` (12px) |

**Margin rule:** cards carry **zero margin**. Spacing is the grid's job (`gap: 11px`). Remove any legacy `margin-bottom` on `.card`. A card must be droppable into any grid cell with no positional side-effects.

**Rhythm rule:** never more than **two consecutive same-size rows**. A screen reads `HERO → HALF+HALF → STRIP → HALF+HALF → …`. HALFs always come in **pairs** (a lone HALF is forbidden — promote it to STRIP or pair it). One row = one HERO, or one HALF-pair, or one STRIP.

---

## 3. Card Grammar

### HERO — `span 2`, one per screen
Carries the screen's ring or headline number. Topline = tiny caps label + accent counter (e.g. the "90"). Body = the focal object plus one supporting number/word and, optionally, a micro-sparkline.

```
┌─────────────────────────────────────┐
│ COMPLIANCE ARC            DAY 34/90  │  caps label · accent counter
│   ╭──────╮                           │
│   │  87  │   READY          ▁▃▅▇▆    │  ring + big state word + micro spark
│   ╰──────╯   on track                │
└─────────────────────────────────────┘
```
May hold: one ring OR one giant numeral, a state word, one sub-line, one sparkline.
May **not** hold: a second ring, a grid of stats, tabs, or paragraph copy.

### HALF — `span 1`, always in PAIRS
One stat each. Big value + tiny caps label + exactly one sub-line.

```
┌──────────────────┐ ┌──────────────────┐
│ STREAK           │ │ RECOVERY         │  caps label (--tx-3)
│ 12               │ │ 68%              │  big numeral (900+)
│ days · best 19   │ │ ▲ 4 vs last wk   │  one sub-line (--tx-2)
└──────────────────┘ └──────────────────┘
```
May hold: one number/percent, its label, one sub-line, optionally a slim inline meter or 34px ring.
May **not** hold: two competing numbers, a list, or a CTA.

### STRIP — `span 2`, slim
Lists, inputs, CTAs, day-grids. Full width, short height, repeating rows.

```
┌─────────────────────────────────────┐
│ ▸ Cold shower              ✓ done    │
│ ▸ Read 20 min              ○ 2 left  │
│ ▸ Train                    ✓ done    │
└─────────────────────────────────────┘
```
May hold: a row list, a single input + submit, a primary CTA, a 7/13/18-col day grid.
May **not** hold: a headline ring or the screen's hero number.

---

## 4. Type Scale

Native stack (`-apple-system`/SF Pro). Two families of type: **numerals** (heavy, tight, glanceable) and **labels** (small caps, tracked). Body is rare.

| Role | Size | Weight | Tracking | Color |
|---|---|---|---|---|
| Hero number (in ring) | 30–34px | 900 | 0 to −0.02em | `--tx` |
| Hero number (bare, big-moment) | 48–74px | 930 | −0.02em | `--tx` |
| HALF stat value | 19–26px | 900–930 | −0.01em | `--tx` |
| Screen title / room head | 22–30px | 900 | −0.02em | `--tx` |
| State word (READY, ON TRACK) | 15–17px | 850 | −0.01em | `--tx` / semantic |
| **Caps label** ("the tiny label") | **10–11px** | 800–850 | 0.06–0.09em · uppercase | `--tx-3` |
| Sub-line | 11–13px | 700–750 | 0 | `--tx-2` |
| Body (used sparingly) | 15px | 400–500 | 0 | `--tx-2` |

**The stat pattern** (HERO supporting stats and every HALF): a **big numeral (≥900)** stacked over a **tiny caps label (10–11px, `--tx-3`)**, plus one `--tx-2` sub-line. Numeral first for scanning; label whispers underneath. Never invert the weight relationship.

---

## 5. Color

Obsidian field, ivory text, a single warm accent, and semantic color used only as signal.

| Surface | Mono (`:root`) | Gold (`[data-theme="dark"]`) |
|---|---|---|
| Field `--bg` | `#0a0a0a` | `#050505` |
| Card `--card` / `--card-2` | white @ 4.5–11% | warm ivory @ 4.5–8.5% |
| Hairline `--line` / `--line-2` | white @ 9–16% | ivory @ 9–16% |

**Ivory text ramp:** `--tx` (primary) → `--tx-2` (0.62, sub-lines) → `--tx-3` (0.50, caps labels & tertiary). Three steps, no more.

**Accent budget** — the accent (`#e3c27d` Gold / `#f2f2f2` Mono) may color **only**:
the "90"/day counter · ring & meter fills (via `--grad`) · state words · eyebrow caps · 1px borders (`--accent-line`) · glows (`--accent-glow`). It may **never** fill a card, button, or large block.

**Semantic color — signal only, never mood:**

| Token | Meaning |
|---|---|
| `--mint` | done / complete / on-track |
| `--amber` | streak / partial / warning |
| `--red` | miss / alert |

Semantic colors appear as text, dots, meter segments, or hairlines — never as card fills. `--grad` (red→amber→mint or accent ramp) fills meters and rings.

---

## 6. Rings & Meters

Rings render at three sizes. Bigger ring → thicker stroke. Track is a dim hairline; fill is `--grad` or accent.

| Ring | Diameter | Stroke | Track | Use |
|---|---|---|---|---|
| Hero | ~88px | 8px | `--line-2` @ ~70% | the one HERO score (Today arc, Sleep score) |
| Stat | ~56px | 6px | `--line-2` @ ~70% | a secondary score inside a HALF |
| Inline | ~34px | 4px | `--line-2` @ ~60% | check/badge ring in a STRIP row |

Ring caps: `stroke-linecap: round`; SVG rotated `-90deg` so fill grows from 12 o'clock. Fill transitions on `--spring`.

**Ring vs bar** — use a **ring** for a single headline 0–100 score you want read at a glance (one per card, the hero of its card). Use a **bar/meter** (`--r-md`, `--grad` fill, 5–8px tall) for progress toward a count, or when comparing several sub-metrics in parallel. Never stack two rings in one card.

---

## 7. Motion

| Move | Spec |
|---|---|
| Press (spring) | `transform: scale(0.97)` on `:active`, `transition: transform ~0.14s var(--spring)` |
| — cards / strips | `scale(0.985)` |
| — chips / tiles | `scale(0.94)` |
| Room push | `.room-view { animation: roomIn 0.32s cubic-bezier(0.32,0.72,0.3,1) both }` — from `translateX(48px)` / opacity 0.35 |
| Tab change | `0.34s cubic-bezier(0.2,0.8,0.2,1)`; **stagger** child cards in on tab switch |
| Micro (color/opacity) | ~150ms ease |

`--spring: cubic-bezier(0.34, 1.45, 0.5, 1)` — the signature overshoot on presses and meter/ring fills.

**Reduced motion:** under `@media (prefers-reduced-motion: reduce)`, drop transforms, room pushes, and staggers; keep only opacity/color fades. Rings/meters snap to value instead of animating.

---

## 8. Per-Screen Hero Assignments

Exactly one HERO per screen, its focal object fixed:

| Screen | HERO focal object |
|---|---|
| Today | **Arc ring** — daily compliance / readiness arc + day counter |
| Sleep | **Sleep score** — ring + state word |
| Habits | **"Your system"** — the standing protocol/identity headline |
| Progress | **Command center** — momentum score + trend spark |
| Plan | **Execution** — today's plan / next-action headline |
| Profile | **Challenge** — the 90-day challenge status |

Everything below each HERO is HALF pairs and STRIPs following the rhythm rule.

---

## 9. Anti-Patterns (rejected — do not reintroduce)

- **Purple / violet / cyan-to-purple gradients.** Banned everywhere. Obsidian + one warm accent only.
- **Accent (or semantic) color as a large fill.** Accent is hairlines, text, meters — never a card, button, or block fill.
- **Kicker / eyebrow badges** as decoration. Toplines are tiny caps labels, not pill badges.
- **Single-width card stacks.** A column of identical full-width cards is the primary thing v4 exists to kill. Mix HERO / HALF-pair / STRIP.
- **Lone HALF cards.** HALF is always paired.
- **More than one hero, or a hero-less screen.** Exactly one.
- **>2 consecutive same-size rows.** Breaks the bento rhythm.
- **Hiding core content behind taps.** The hero number/ring and today's actions are visible on load — never gated behind a tap, tab, or expand.
- **Empty minimalism / decorative blobs.** No radial-blob backgrounds, no whitespace-as-feature. Fill the bento with real data.
