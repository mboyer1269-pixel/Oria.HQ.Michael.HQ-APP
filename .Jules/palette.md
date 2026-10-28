## 2024-10-14 - Keyboard accessibility on icon-only buttons
**Learning:** Custom interactive elements (like icon buttons with Tailwind) frequently lack default focus states, making them invisible to keyboard navigation.
**Action:** Always explicitly add `focus-visible:outline-none focus-visible:ring-2` with appropriate ring colors/offsets for keyboard accessibility, especially for icon-only buttons.
