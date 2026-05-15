# Design Direction

## What this should NOT look like

- Generic SaaS chatbot UI (Inter, blue gradients, centered hero, three
  feature cards, lucide icons everywhere)
- ChatGPT clone with shadcn defaults untouched
- "AI-generated landing page" cliches (purple-to-blue gradient, glassmorphism,
  floating screenshots at 15deg, glowing accents)

## Direction

Pick ONE strong aesthetic point of view and execute it with precision.
Suggestions (pick one, don't blend):

1. **Editorial / magazine** — generous whitespace, an elegant serif display
   font (Fraunces, GT Sectra, or similar) paired with a refined sans for
   body. Two-tone palette: warm cream + a deep accent (forest green or
   burnt sienna). Section breaks as horizontal rules. Type sizes meaningfully
   different. Looks like a thoughtful coaching newsletter, not a SaaS app.

2. **Analog / craft** — slightly off-grid, hand-drawn dividers or icons,
   warm muted palette (off-white, charcoal, terracotta). A monospace
   accent font for metadata. Feels like a coach's notebook digitized.

3. **Refined minimal (Linear-adjacent but not Linear)** — pick a distinctive
   neutral palette (warm grays not blue grays). Tight type scale. Subtle
   gradient on borders, not backgrounds. Functional and crisp.

## Constraints regardless of direction

- **Typography:** at least two distinct typefaces. NEVER Inter. NEVER
  system stack as the primary face. Look at Fraunces, Söhne, GT America,
  Manrope, Geist, IBM Plex Sans, JetBrains Mono, Fraunces, Instrument Serif.
- **Color:** ≤5 colors total. Dominant tone + one sharp accent.
  Custom Tailwind theme tokens — no raw `bg-blue-500`.
- **Animation:** one or two well-orchestrated moments (page-load stagger,
  message-arrival cascade). Not micro-animations on every hover.
- **Two tenants, two flavors:** StrengthLab and FuelRight share the
  component system but each gets a primary accent color that's distinctly
  theirs. Switching tenants should feel like switching brands.

## What "feels intentional and shipped" means

- Empty states have illustration or distinctive copy, not just "No data."
- Loading is skeleton, not spinner. Skeletons match the shape of incoming
  content.
- Citation chips are visually identified to the brand, not generic blue badges.
- The chat composer has personality — placeholder copy that sounds like the
  coach (e.g., StrengthLab: "What are you training today?"; FuelRight:
  "What did you eat?").
- Marketing landing page is brief and direct — one screen, one CTA, no
  feature-card-trio.
