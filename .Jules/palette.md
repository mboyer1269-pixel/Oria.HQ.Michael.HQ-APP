## 2024-10-24 - Visually Hidden Elements Accessibility

**Learning:** Interactive elements that are visually hidden by default (e.g., using `opacity: 0` to only show on hover like drag handles) must explicitly set `focus-visible:opacity-100` alongside standard focus rings to remain accessible for keyboard navigation. Otherwise, keyboard users will tab to an invisible element.
**Action:** When adding standard focus styles (`focus-visible:ring-2`, etc.) to elements that rely on hover for visibility, always check their default opacity/visibility and ensure they become visible when focused using `focus-visible:opacity-100` or equivalent.
