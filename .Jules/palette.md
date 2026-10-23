## 2026-10-17 - Explicit Focus States & Aria Labels for Icon-Only Buttons
**Learning:** Icon-only buttons (like Trash2 or ClipboardCopy) throughout this codebase often lack `aria-label` for screen readers and `focus-visible` rings for keyboard users. Relying on just `title` is insufficient for accessibility and keyboard navigation.
**Action:** When adding or modifying icon-only buttons, always explicitly add `aria-label="[Descriptive action]"` and `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color]-500/50` to the button's Tailwind classes.
