## 2024-05-18 - Drag handles keyboard accessibility
**Learning:** Elements using CSS `opacity: 0` on hover for visual cleanliness (like drag handles) become entirely invisible during keyboard navigation. This breaks accessibility for power users and screen readers.
**Action:** Always move `opacity` out of inline styles and into Tailwind classes, then append `focus-visible:opacity-100` alongside standard focus rings (`focus-visible:ring-2`, etc.).
