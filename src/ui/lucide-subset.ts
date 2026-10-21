/**
 * Minimal subset of @pmndrs/uikit-lucide containing only the icons used by
 * Talking Drum VR's UIKitML panels (`RectangleGoggles` and `LogIn`) plus the
 * two internal icons imported by `@pmndrs/uikit-horizon` (`CheckIcon` and `ChevronDownIcon`).
 *
 * `@drawcall/uikitml/dist/kits.js` uses `import * as Lucide from "@pmndrs/uikit-lucide"`
 * and `Object.entries(Lucide)`, which prevents Rollup/esbuild from tree-shaking the
 * 1,590 unused icons (~4.2 MB raw / ~1.04 MB gzipped). Aliasing `@pmndrs/uikit-lucide`
 * to this module keeps the Horizon kit functional while eliminating the icon bloat.
 */

export {
  RectangleGoggles,
  RectangleGogglesIcon,
} from '../../node_modules/@pmndrs/uikit-lucide/dist/RectangleGoggles.js';
export { LogIn, LogInIcon } from '../../node_modules/@pmndrs/uikit-lucide/dist/LogIn.js';
export { Check, CheckIcon } from '../../node_modules/@pmndrs/uikit-lucide/dist/Check.js';
export {
  ChevronDown,
  ChevronDownIcon,
} from '../../node_modules/@pmndrs/uikit-lucide/dist/ChevronDown.js';
