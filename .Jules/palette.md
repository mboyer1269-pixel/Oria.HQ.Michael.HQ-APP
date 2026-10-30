
## 2024-10-30 - Added focus states to Cockpit widgets
**Learning:** Interactive elements hidden via inline styles (`opacity: 0`) prevent Tailwind `focus-visible` pseudo-classes from functioning correctly when focused via keyboard.
**Action:** Moved opacity and transition properties from inline styles to Tailwind utility classes, allowing `focus-visible:opacity-100` alongside focus rings (`focus-visible:ring-2`) to ensure keyboard accessibility.
