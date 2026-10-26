## 2026-06-15 - [Keyboard Accessibility for Visually Hidden Interactive Elements]
**Learning:** Elements that are visually hidden by default using `opacity: 0` (like drag handles revealed only on hover) are invisible when focused via keyboard navigation unless explicitly addressed.
**Action:** When adding keyboard focus states (`focus-visible:ring-*`), always explicitly add `focus-visible:opacity-100` to ensure the element becomes visible when it receives keyboard focus, alongside the standard focus outline.
