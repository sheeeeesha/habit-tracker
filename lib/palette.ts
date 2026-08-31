/**
 * The Wrapped palette: saturated, high-contrast colours that sit on near-black.
 * Each accent ships with a readable "ink" for text placed ON the colour — the
 * Wrapped rule is bold type on FLAT colour, never on a gradient.
 */

export interface Accent {
  key: AccentKey;
  /** Shown in the colour picker. */
  label: string;
  hex: string;
  /** Text/icon colour to use when `hex` is the background. */
  ink: string;
  /** A second stop for gradient moments (Wrapped slides, hero fills). */
  hex2: string;
}

export type AccentKey =
  | "hyperpink"
  | "acid"
  | "electric"
  | "ultra"
  | "sunburn"
  | "highlight"
  | "fresh"
  | "bubblegum";

export const ACCENTS: Record<AccentKey, Accent> = {
  hyperpink: { key: "hyperpink", label: "Hyperpink", hex: "#FF2E88", ink: "#180008", hex2: "#FF7AC6" },
  acid:      { key: "acid",      label: "Acid",      hex: "#C7F94E", ink: "#121A00", hex2: "#7DF9A8" },
  electric:  { key: "electric",  label: "Electric",  hex: "#3DE0FF", ink: "#001820", hex2: "#7C6CFF" },
  ultra:     { key: "ultra",     label: "Ultra",     hex: "#9B5CFF", ink: "#FFFFFF", hex2: "#FF5CE1" },
  sunburn:   { key: "sunburn",   label: "Sunburn",   hex: "#FF6039", ink: "#1E0400", hex2: "#FFB03A" },
  highlight: { key: "highlight", label: "Highlight", hex: "#FFD93D", ink: "#1C1400", hex2: "#FF8A3D" },
  fresh:     { key: "fresh",     label: "Fresh",     hex: "#1ED760", ink: "#00160A", hex2: "#C7F94E" },
  bubblegum: { key: "bubblegum", label: "Bubblegum", hex: "#FF9CD8", ink: "#1E0014", hex2: "#B98BFF" },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

export function accentOf(key: string): Accent {
  return ACCENTS[key as AccentKey] ?? ACCENTS.hyperpink;
}

/** Deterministic accent for a new habit so consecutive habits never clash. */
export function nextAccent(usedCount: number): AccentKey {
  return ACCENT_KEYS[usedCount % ACCENT_KEYS.length];
}
