## 2024-05-09 - Missing focus states on custom interactive elements
**Learning:** Custom interactive elements (like buttons with Tailwind and SVG icons) frequently lack default focus states, making them difficult to use for keyboard navigation.
**Action:** Always explicitly add `focus-visible:outline-none focus-visible:ring-2` with appropriate ring colors/offsets for keyboard accessibility.
