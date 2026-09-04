// Type-only import: the mobile app never imports the `StampType` const object as a
// runtime value from @omnianote/shared. That package ships CommonJS, and as a symlinked
// workspace package (not a node_modules dependency Vite pre-bundles), its named exports
// aren't visible to Vite's dev-server ESM interop — only `import type` survives, since
// it's erased entirely at compile time. Plain string literals stand in for the values.
import type { StampType } from "@omnianote/shared";

export const STAMP_ORDER: StampType[] = ["LEAK", "ELECTRICAL", "SAFETY_HAZARD", "PARTS_NEEDED", "FIXED"];

export const STAMP_META: Record<StampType, { label: string; emoji: string; color: string }> = {
  LEAK: { label: "Leak", emoji: "💧", color: "#4a9fd8" },
  ELECTRICAL: { label: "Electrical", emoji: "⚡", color: "#e3c552" },
  SAFETY_HAZARD: { label: "Safety Hazard", emoji: "⚠️", color: "#d9694f" },
  PARTS_NEEDED: { label: "Parts Needed", emoji: "🔧", color: "#a67fd8" },
  FIXED: { label: "Fixed", emoji: "✅", color: "#5cb87a" },
};
