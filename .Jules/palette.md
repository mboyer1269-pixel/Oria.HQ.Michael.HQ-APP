## 2024-03-20 - Adding focus-visible to UI Elements
**Learning:** Elements that are visually hidden by default using 'opacity: 0' and only shown on hover (like drag handles), or pseudo interactive elements need clear keyboard accessibility focusing using `focus-visible:opacity-100`, `focus-visible:outline-none`, and `focus-visible:ring-2`.
**Action:** Always add keyboard accessibility classes to pseudo interactive buttons, especially drag handlers or search triggers.
