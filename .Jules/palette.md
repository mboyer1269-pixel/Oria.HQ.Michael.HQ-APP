## 2025-02-23 - Add Keyboard Focus States to Cockpit Buttons
**Learning:** Custom interactive elements (like buttons with Tailwind and SVG icons) frequently lack default focus states, making them inaccessible for keyboard users.
**Action:** Always explicitly add `focus-visible:outline-none focus-visible:ring-2` with appropriate ring colors/offsets for keyboard accessibility when building or modifying custom UI controls.
