## 2026-10-09 - Command Palette Trigger Accessibility
**Learning:** Found an icon-only button triggering the command palette without any accessible name (ARIA label), hiding its function from screen reader users. The application seems to use French heavily for labeling.
**Action:** Always verify icon-only buttons (like those with just a `Search` icon) have an appropriate `aria-label` set, using the established application language.
