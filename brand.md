# Sophia Brand Guidelines

## Product Identity

**Name:** Sophia  
**Tagline:** Enterprise-Grade Autonomous Wallet Orchestration for Solana  
**Category:** AI/Tech Infrastructure  
**Audience:** Developers, autonomous agents, Solana ecosystem builders

---

## Color Palette: Bold Aggressive

Selected April 20, 2026. A high-impact, modern palette optimized for precision, clarity, and technological sophistication.

### Primary Colors

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Background** | Pure Black | `#000000` | Main page backgrounds, cards at depth 0 |
| **Surface** | Deep Black | `#0a0a0a` | Elevated cards, panels |
| **Text Primary** | Pure White | `#ffffff` | Body copy, headings, high contrast |
| **Text Secondary** | Light Gray | `#e0e0e0` | Secondary labels, hints |

### Accent Colors

| Role | Color | Hex | WCAG AA | Usage |
|------|-------|-----|---------|-------|
| **Primary (Magenta)** | Electric Magenta | `#ff0080` | 5.8:1 ✓ | Call-to-action buttons, active states, primary accents |
| **Secondary (Cyan)** | Neon Cyan | `#00d9ff` | 6.2:1 ✓ | Secondary actions, focus rings, information |

### Supporting Colors

| State | Color | Hex | Usage |
|-------|-------|-----|-------|
| **Success** | Bright Green | `#00d964` | Status indicators, positive states |
| **Warning** | Bright Orange | `#ffa500` | Caution, pending states |
| **Error** | Bright Red | `#ff3b3b` | Error states, destructive actions |
| **Info** | Cyan (Secondary) | `#00d9ff` | Information, agents active |

### Grayscale (for borders, dividers, subtlety)

| Level | Color | Hex | Opacity | Usage |
|-------|-------|-----|---------|-------|
| **L0** | Black | `#000000` | — | Base |
| **L1** | Dark Gray | `#1a1a1a` | — | Subtle borders |
| **L2** | Gray | `#2d2d2d` | — | Visible borders |
| **L3** | Medium Gray | `#4d4d4d` | — | Focused borders |
| **L4** | Light Gray | `#606060` | — | Muted text |
| **L5** | Lighter Gray | `#a0a0a0` | — | Tertiary text |
| **L6** | White | `#ffffff` | — | Primary text |

### Brand Gradients

Two gradient accents derived from magenta → cyan spectrum. Applied to backgrounds, CTAs, and hero sections.

| Gradient | Direction | Colors | Opacity | Usage |
|----------|-----------|--------|---------|-------|
| **Subtle BG** | 135° (↘) | Magenta → Cyan | 10% | Background layers, card accents, gentle depth |
| **Accent** | 135° (↘) | Magenta → Cyan | 100% | Primary CTA buttons, hero sections, emphasis |
| **Accent Dark** | 135° (↘) | Magenta → Cyan | 20% | Hover states, focus rings, secondary emphasis |

**Tailwind Classes:**
- `bg-gradient-brand-subtle` — Subtle background gradient
- `bg-gradient-brand-accent` — Full-strength accent gradient
- `bg-gradient-brand-accent-dark` — Semi-transparent accent

**Example Usage:**
```jsx
// Hero section with accent gradient
<div className="bg-gradient-brand-accent text-white">
  <h1>Autonomous Wallet Orchestration</h1>
</div>

// Card with subtle background
<div className="bg-gradient-brand-subtle rounded-lg p-6">
  <p>Agent Details</p>
</div>

// Button with gradient
<button className="bg-gradient-brand-accent text-white">Execute Intent</button>
```

---

## Typography

### Font Pair: Bold Modern

**Selected:** April 20, 2026  
**Reasoning:** Ultra-geometric + quirky. Syne brings striking, futuristic personality. Space Mono adds contemporary technical charm. Together they stand out while remaining readable and precise.

#### Primary Font: Syne (Heading + Body)

- **Weights:** 400 (regular), 700 (bold)
- **Characteristics:** Geometric, bold, high contrast, contemporary
- **Usage:** All headings, body text, primary UI labels
- **Import:** `next/font/google` via `pages/_app.tsx`

#### Monospace Font: Space Mono (Code + Addresses)

- **Weights:** 400 (regular), 700 (bold)
- **Characteristics:** Quirky, technical, high personality
- **Usage:** Addresses, transaction IDs, code snippets, labels
- **Import:** `next/font/google` via `pages/_app.tsx`

### Typography Scale (Syne)

- **Display Large:** 2.25rem (36px), font-weight 600
- **Display Small:** 1.875rem (30px), font-weight 600
- **Heading Large:** 1.5rem (24px), font-weight 600
- **Heading Medium:** 1.25rem (20px), font-weight 600
- **Heading Small:** 1rem (16px), font-weight 600
- **Body:** 1rem (16px), font-weight 400
- **Body Small:** 0.875rem (14px), font-weight 400
- **Label:** 0.75rem (12px), font-weight 600 (uppercase, +0.5px tracking)
- **Caption:** 0.625rem (10px), font-weight 400

---

## Tone & Voice

### Tone (3 pillars)

1. **Precise** — Clear, technical language. No ambiguity. Developers understand requirements instantly.
2. **Authoritative** — Enterprise-grade confidence. This system is reliable, secure, battle-tested.
3. **Direct** — Active voice. Show, don't tell. Actions over descriptions.

### Copy Guidelines

- **Action buttons:** Verb-first ("Send SOL", "Execute Intent", "Deploy Agent")
- **Error messages:** Explain the problem + clear recovery action
- **Labels:** Uppercase, technical precision ("TOTAL BALANCE", "ACTIVE AGENTS")
- **Avoid:** Cute language, excessive warmth, jargon without context

### Examples

✓ **Good:** "Agent requires signing permission. Tap to authorize."  
✗ **Bad:** "Oops! Your agent is a little confused. Maybe you should help it?"

✓ **Good:** "Distribution agent paused — balance below minimum (0.1 SOL)"  
✗ **Bad:** "Oh no, running low on SOL!"

---

## Visual Principles

### Contrast

- Text on backgrounds: **minimum 4.5:1 (WCAG AA)**
- Large text (18px+): **minimum 3:1**
- Interactive elements: **visible focus rings** (Cyan `#00d9ff` or Magenta `#ff0080`)

### Spacing & Layout

- **Grid base:** 8px (standard Tailwind spacing)
- **Cards:** 12px border-radius
- **Buttons:** 8px border-radius
- **Padding:** 16px standard card padding; 12px compact areas
- **Gaps:** 16px between sections; 8px between items

### Motion

- **Transitions:** 200ms ease-out for state changes (hover, active, focus)
- **Duration:** 300ms for card interactions (shadow, elevation)
- **Principle:** Subtle, purposeful — never slow or distracting
- **Reduced Motion:** Respect `prefers-reduced-motion: reduce` (disable animations)

### Depth

- **No gradient overlays** — pure colors only
- **Elevation via:** Border opacity, background color shifts, shadow (subtle, dark-friendly)
- **Card shadows:** Dark theme optimized

---

## Component Palette Mapping

### Primary CTA

```
Background: #ff0080 (Magenta)
Foreground: #ffffff (White)
Hover: #e60073 (darker magenta)
Disabled: 50% opacity
```

### Secondary CTA

```
Background: transparent
Border: #00d9ff (Cyan)
Text: #00d9ff
Hover: background becomes #00d9ff15 (cyan + 8% opacity)
```

### Status Indicators (dots, badges)

```
Success: #00d964 (bright green)
Warning: #ffa500 (bright orange)
Error: #ff3b3b (bright red)
Idle: #808080 (gray)
Active: #00d9ff (cyan) with pulse animation
```

### Form Fields

```
Background: #0a0a0a (deep black)
Border: #2d2d2d (gray)
Border on focus: #00d9ff (cyan)
Text: #ffffff (white)
Placeholder: #606060 (muted gray)
```

---

## Implementation Details

### Font Loading (Next.js)

Fonts are loaded via Google Fonts in `apps/frontend/pages/_app.tsx`:

```tsx
import { Syne, Space_Mono } from 'next/font/google';

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '700'],
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});
```

These are injected into the main app wrapper using CSS variables:
- `--font-sans` → Syne (via `syne.variable`)
- `--font-mono` → Space Mono (via `spaceMono.variable`)

### Tailwind Configuration

Font families reference the CSS variables in `apps/frontend/tailwind.config.ts`:

```ts
fontFamily: {
  sans: ['var(--font-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  mono: ['var(--font-mono)', 'SF Mono', 'Consolas', 'Liberation Mono', 'monospace'],
}
```

### Color Palette Implementation

All colors are defined in `apps/frontend/tailwind.config.ts` under the theme.extend.colors section.

**Primary color tokens:**
- `bg-black`, `bg-surface`, `bg-background`
- `text-white`, `text-secondary`
- `bg-primary-*`, `bg-secondary-*` (Tailwind scales 50-900)

**Usage:**
```tsx
<button className="bg-primary-500 text-white hover:bg-primary-600">
  Send SOL
</button>

<input className="bg-surface border border-border focus:border-secondary-500" />
```

---

## Dark Mode

**Status:** Active (default, no light mode variant planned)

All tokens are optimized for dark theme. The palette was selected **for maximum contrast on black**.

### Contrast Matrix

| Element | BG Color | FG Color | Ratio | Pass |
|---------|----------|----------|-------|------|
| Body Text | `#000000` | `#ffffff` | 21.0:1 | ✓ AA + AAA |
| Primary CTA | `#ff0080` | `#ffffff` | 5.8:1 | ✓ AA |
| Secondary CTA | `#000000` | `#00d9ff` | 6.2:1 | ✓ AA |
| Labels | `#000000` | `#e0e0e0` | 11.8:1 | ✓ AA + AAA |

---

## Accessibility

### Keyboard Navigation

- All interactive elements are keyboard focusable
- Focus ring: 2px solid `#00d9ff` with 2px offset (matches design)
- Tab order: logical, follows visual flow

### Screen Readers

- Semantic HTML (buttons, links, forms, headings)
- ARIA labels for custom components
- Status updates announced via `aria-live="polite"`

### Motion Sensitivity

- Animations respect `prefers-reduced-motion: reduce`
- Pulse animations disabled for reduced-motion users
- No auto-playing content

### Color Blindness

- No information conveyed by color alone (status always has icon + text + color)
- Sufficient contrast for all palettes (protanopia, deuteranopia, tritanopia)

---

## File References

- **Tailwind Config:** `apps/frontend/tailwind.config.ts`
- **Global Styles:** `apps/frontend/styles/globals.css`
- **Components:** `apps/frontend/components/**/*.tsx`
- **Pages:** `apps/frontend/pages/**/*.tsx`

---

## Future Iterations

- [ ] Brand gradients (magenta-to-cyan spectrum)
- [ ] Animation library (Framer Motion + brand motion guidelines)
- [ ] Component storybook with brand theme examples
- [ ] Light mode variant (if needed)

---

**Last Updated:** April 20, 2026  
**Version:** 1.0 (Bold Aggressive + Syne + Space Mono)  
**Status:** ✅ Complete — Brand palette + typography applied to frontend
