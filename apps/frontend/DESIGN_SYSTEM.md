# Sophia Design System

**Design Philosophy:** Enterprise-grade autonomy, premium craft, 20+ years of Figma experience.

## Color Palette

### Primary (Cyan → Blue Gradient)
- `cyan-50`: #f0fdfa
- `cyan-400`: #22d3ee (Accent bright)
- `cyan-500`: #06b6d4 (Primary)
- `blue-600`: #2563eb (Accent dark)
- `blue-950`: #030712 (Darkest text)

### Semantic Colors
- **Success**: Emerald-500 (#10b981)
- **Warning**: Amber-500 (#f59e0b)
- **Error**: Rose-500 (#f43f5e)
- **Info**: Indigo-500 (#6366f1)

### Neutrals (Premium Dark Mode)
- `slate-950`: #030712 (True black, ultra-premium)
- `slate-900`: #0f172a (Deep background)
- `slate-800`: #1e293b (Card background)
- `slate-700`: #334155 (Borders)
- `slate-400`: #94a3b8 (Secondary text)
- `slate-300`: #cbd5e1 (Primary text)
- `slate-50`:  #f8fafc (Lightest text)

## Typography

### Font Scale
- **H1**: 56px / 1.1 / 700 (96px display)
- **H2**: 42px / 1.2 / 700
- **H3**: 32px / 1.3 / 600
- **H4**: 24px / 1.3 / 600
- **Body Large**: 18px / 1.6 / 400
- **Body**: 16px / 1.6 / 400
- **Body Small**: 14px / 1.6 / 400
- **Label**: 12px / 1.5 / 500

### Font Families
- **Display**: Inter (700, 800)
- **Body**: Inter (400, 500, 600)

## Spacing System

8px baseline grid:
- `xs`: 4px
- `sm`: 8px
- `md`: 16px
- `lg`: 24px
- `xl`: 32px
- `2xl`: 48px
- `3xl`: 64px
- `4xl`: 96px

## Component Standards

### Card (Premium Depth)
- Background: `slate-800/50` + `backdrop-blur-sm`
- Border: `1px solid slate-700`
- Radius: `12px`
- Padding: `24px`
- Shadow: `0 4px 12px rgba(0, 0, 0, 0.3)`
- Hover: Border → `cyan-500/50`, Shadow → `0 8px 24px rgba(34, 211, 238, 0.1)`

### Button (Interactive)
- **Primary**: Gradient `cyan-500 → blue-600`, hover scale 105%
- **Secondary**: Border `slate-700`, hover `bg-slate-800/50`
- **Tertiary**: Text only, hover underline
- Radius: `8px`
- Padding: `12px 24px` (medium)
- Transition: `all 300ms cubic-bezier(0.4, 0, 0.2, 1)`

### Inputs
- Background: `slate-900`
- Border: `1px solid slate-700`
- Focus: `2px solid cyan-500`
- Radius: `8px`
- Padding: `12px 16px`

### Badge
- Background: `cyan-500/10`
- Color: `cyan-400`
- Border: `1px solid cyan-500/20`
- Radius: `20px`
- Padding: `6px 12px`

## Animation & Motion

### Transitions
- **Quick**: 150ms (micro-interactions)
- **Standard**: 300ms (hover, toggle)
- **Slow**: 500ms (entrance)
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` (ease-out)

### Entrance Animations
- Fade in: 300ms, opacity 0 → 1
- Scale in: 300ms, scale 0.95 → 1, opacity 0 → 1
- Slide up: 400ms, translateY(20px) → 0

### Hover Interactions
- Buttons: `transform hover:scale-105`
- Cards: `hover:border-cyan-500/50 hover:shadow-lg`
- Links: `underline opacity-80 hover:opacity-100`

## Spacing & Rhythm

### Sections
- Interior padding: `32px` (desktop), `24px` (tablet), `16px` (mobile)
- Section margins: `64px` (desktop), `48px` (tablet), `32px` (mobile)
- Max-width containers: `7xl` (1280px)

### Grid
- Gap: `24px` (3-column), `32px` (2-column)
- Responsive: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

## Premium Touches

1. **Gradients**: Subtle `to-transparent` edges, never harsh
2. **Blur**: `backdrop-blur-sm` for depth, `backdrop-blur-xl` for modals
3. **Shadows**: Layered (`0 4px 12px`, `0 8px 24px`), soft darkness
4. **Borders**: Always semi-transparent (`/50` or `/20`)
5. **Typography**: Generous line-height (1.6), careful letter-spacing
6. **Whitespace**: Never crowded; "less is more" philosophy

## Accessibility

- Contrast ratio: ≥7:1 for body text
- Focus states: Visible 2px outline in cyan-500
- Keyboard nav: Tab → outline, Enter → activate
- Screen readers: Semantic HTML, ARIA labels
