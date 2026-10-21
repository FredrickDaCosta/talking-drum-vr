# Accessibility Notes (M0 Stub)

- **Seated-Only Ergonomics:** All interactive elements and the talking drum are positioned for comfortable seated play (`0.5 m` ahead, `0.35 m` below eye level), recalibrating automatically to the player's actual head height on XR session entry.
- **Hands-First Interaction:** No controller buttons or thumbsticks are required; WebXR `hand-tracking` is requested on session start.
- **2D Keyboard & Screen-Reader Access:** An accessible HTML `<button id="enter-vr-button">` with `aria-label` and visible `:focus-visible` outline accompanies the 3D UIKitML welcome panel.
