## 2026-11-01 - Accessible drag handles
**Learning:** Interactive elements that rely on hover for visibility (like drag handles) become invisible to keyboard users if they lack focus-visible opacity overrides.
**Action:** Always pair hover-based visibility (opacity-0 to opacity-100) with focus-visible:opacity-100 and a visible focus ring for keyboard accessibility, ensuring inline styles don't conflict with these pseudo-classes.
