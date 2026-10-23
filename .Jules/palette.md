## 2026-10-23 - [Keyboard Accessibility for Hidden Elements]
**Learning:** Interactive elements that are visually hidden by default using `opacity: 0` (like drag handles on hover) must explicitly set `focus-visible:opacity-100` along with standard focus rings, otherwise they remain invisible to keyboard users navigating via Tab.
**Action:** Always test keyboard navigation on elements with hover-based visibility, and apply `focus-visible:opacity-100` or equivalent to ensure they appear when focused.
