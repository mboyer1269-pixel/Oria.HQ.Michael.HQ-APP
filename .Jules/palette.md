## 2024-10-29 - Missing focus states on Cockpit Drag Handles
**Learning:** Interactive elements that are visually hidden by default (opacity: 0 on hover) like the cockpit drag handles lack keyboard accessibility because they don't have focus states. Users relying on keyboard navigation cannot see which handle has focus.
**Action:** Always add focus-visible classes alongside standard focus rings to interactables hidden by opacity, e.g., 'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2'.
