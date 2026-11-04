## 2023-11-04 - Keyboard focus for visually hidden hover elements
**Learning:** Elements like drag handles that are visually hidden by default (`opacity: 0`) and revealed on hover often lack keyboard accessibility because they remain invisible when focused via tab.
**Action:** Always move `opacity` and `transition` out of inline styles and into utility classes. Add `focus-visible:opacity-100` alongside standard focus rings (`focus-visible:outline-none focus-visible:ring-2`) so keyboard users can see the element when navigating.
