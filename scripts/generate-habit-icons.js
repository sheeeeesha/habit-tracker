const fs = require("fs");

// key, Phosphor component name, label, group
const SET = [
  ["fire",        "Fire",            "Streak",     "Focus"],
  ["target",      "Target",          "Goal",       "Focus"],
  ["star",        "Star",            "Star",       "Focus"],
  ["sparkle",     "Sparkle",         "Spark",      "Focus"],
  ["trophy",      "Trophy",          "Win",        "Focus"],
  ["bolt",        "Lightning",       "Energy",     "Focus"],

  ["barbell",     "Barbell",         "Lift",       "Body"],
  ["run",         "PersonSimpleRun", "Run",        "Body"],
  ["bike",        "Bicycle",         "Cycle",      "Body"],
  ["steps",       "Footprints",      "Walk",       "Body"],
  ["heart",       "Heartbeat",       "Cardio",     "Body"],
  ["mountain",    "Mountains",       "Outdoors",   "Body"],

  ["book",        "BookOpen",        "Read",       "Mind"],
  ["brain",       "Brain",           "Learn",      "Mind"],
  ["pencil",      "PencilSimple",    "Write",      "Mind"],
  ["notebook",    "Notebook",        "Journal",    "Mind"],
  ["idea",        "Lightbulb",       "Ideas",      "Mind"],
  ["study",       "GraduationCap",   "Study",      "Mind"],

  ["water",       "Drop",            "Water",      "Wellness"],
  ["bed",         "Bed",             "Sleep",      "Wellness"],
  ["moon",        "Moon",            "Wind down",  "Wellness"],
  ["meditate",    "FlowerLotus",     "Meditate",   "Wellness"],
  ["bath",        "Bathtub",         "Self-care",  "Wellness"],
  ["tooth",       "Tooth",           "Teeth",      "Wellness"],
  ["pill",        "Pill",            "Medication", "Wellness"],

  ["meal",        "ForkKnife",       "Eat well",   "Food"],
  ["veg",         "Carrot",          "Veggies",    "Food"],
  ["coffee",      "Coffee",          "Coffee",     "Food"],
  ["cook",        "CookingPot",      "Cook",       "Food"],
  ["groceries",   "Basket",          "Groceries",  "Food"],

  ["clean",       "Broom",           "Tidy",       "Home"],
  ["plant",       "Plant",           "Plants",     "Home"],
  ["pet",         "Dog",             "Pet",        "Home"],
  ["recycle",     "Recycle",         "Recycle",    "Home"],
  ["errands",     "ShoppingCart",    "Errands",    "Home"],
  ["wallet",      "Wallet",          "Budget",     "Home"],
  ["save",        "PiggyBank",       "Save",       "Home"],

  ["call",        "Phone",           "Call",       "People"],
  ["message",     "ChatCircle",      "Message",    "People"],
  ["friends",     "UsersThree",      "Friends",    "People"],
  ["mail",        "Envelope",        "Inbox",      "People"],

  ["music",       "MusicNotes",      "Music",      "Create"],
  ["paint",       "PaintBrush",      "Art",        "Create"],
  ["photo",       "Camera",          "Photo",      "Create"],
  ["guitar",      "Guitar",          "Practice",   "Create"],
  ["code",        "Code",            "Build",      "Create"],

  ["quit",        "Cigarette",       "Quit",       "Other"],
  ["clock",       "Clock",           "On time",    "Other"],
];

const WEIGHTS = ["thin", "light", "regular", "bold", "fill", "duotone"];

function boldPaths(name) {
  const file = `node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`;
  const src = fs.readFileSync(file, "utf8");
  const start = src.indexOf('"bold"');
  if (start === -1) throw new Error(`no bold weight for ${name}`);
  // Slice up to whichever weight is declared next, so we never bleed into it.
  let end = src.length;
  for (const w of WEIGHTS) {
    const i = src.indexOf(`"${w}"`, start + 6);
    if (i !== -1 && i < end) end = i;
  }
  const chunk = src.slice(start, end);
  const paths = [...chunk.matchAll(/d:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) throw new Error(`no path data for ${name}`);
  const others = chunk.match(/createElement\("(?!path)(\w+)"/g);
  if (others) throw new Error(`${name} uses non-path shapes: ${others.join(",")}`);
  return paths;
}

const entries = SET.map(([key, comp, label, group]) => {
  const paths = boldPaths(comp);
  return { key, label, group, paths };
});

const groups = [...new Set(entries.map((e) => e.group))];

const body = entries
  .map(
    (e) =>
      `  ${e.key}: {\n` +
      `    key: "${e.key}",\n` +
      `    label: ${JSON.stringify(e.label)},\n` +
      `    group: ${JSON.stringify(e.group)},\n` +
      `    paths: [${e.paths.map((p) => JSON.stringify(p)).join(", ")}],\n` +
      `  },`,
  )
  .join("\n");

const out = `// GENERATED FILE — do not edit by hand.
// Regenerate with scripts/generate-habit-icons.js
//
// Habit icons are Phosphor glyphs at bold weight, stored as raw path data on
// Phosphor's native 256x256 grid rather than imported as React components.
//
// One catalog, two renderers: the DOM draws these paths inline, and the
// Wrapped share card draws the *same* strings into a canvas via Path2D. Any
// other arrangement lets the two drift apart.

export interface HabitIcon {
  key: HabitIconKey;
  /** Shown under the glyph in the picker. */
  label: string;
  group: string;
  /** Phosphor bold outlines on a 256x256 viewBox. */
  paths: string[];
}

export type HabitIconKey =
${entries.map((e) => `  | "${e.key}"`).join("\n")};

/** Phosphor's native grid. Both renderers scale from this. */
export const ICON_GRID = 256;

export const HABIT_ICONS: Record<HabitIconKey, HabitIcon> = {
${body}
};

export const HABIT_ICON_KEYS = Object.keys(HABIT_ICONS) as HabitIconKey[];

export const HABIT_ICON_GROUPS: string[] = ${JSON.stringify(groups)};

export const DEFAULT_HABIT_ICON: HabitIconKey = "fire";

export function habitIcon(key: string): HabitIcon {
  return HABIT_ICONS[key as HabitIconKey] ?? HABIT_ICONS[DEFAULT_HABIT_ICON];
}

/**
 * Habits used to store a literal emoji. Anything unrecognised falls back to
 * the default rather than vanishing.
 */
const FROM_EMOJI: Record<string, HabitIconKey> = {
  "\u{1F525}": "fire",
  "\u{1F4AA}": "barbell",
  "\u{1F3C3}": "run",
  "\u{1F9D8}": "meditate",
  "\u{1F4DA}": "book",
  "\u{1F4A7}": "water",
  "\u{1F957}": "veg",
  "\u{1F634}": "bed",
  "\u{1F3B8}": "guitar",
  "\u{1F9E0}": "brain",
  "\u270D": "pencil",
  "\u{1F3A8}": "paint",
  "\u{1F9F9}": "clean",
  "\u{1F4B0}": "wallet",
  "\u260E": "call",
  "\u{1F331}": "plant",
  "\u{1F6AD}": "quit",
  "\u{1F9F4}": "bath",
  "\u{1F9B7}": "tooth",
  "\u{1F6B6}": "steps",
  "\u{1F3CB}": "barbell",
  "\u{1F34E}": "veg",
  "\u2615": "coffee",
  "\u{1F3AF}": "target",
};

export function iconKeyFromEmoji(emoji: unknown): HabitIconKey {
  if (typeof emoji !== "string" || !emoji) return DEFAULT_HABIT_ICON;
  // Strip variation selectors so "\u260E\uFE0F" matches "\u260E".
  const bare = emoji.replace(/[\uFE0E\uFE0F]/g, "");
  return FROM_EMOJI[bare] ?? DEFAULT_HABIT_ICON;
}
`;

fs.writeFileSync("lib/habitIcons.ts", out);
console.log(`wrote lib/habitIcons.ts — ${entries.length} icons, ${groups.length} groups`);
console.log("approx size:", Math.round(out.length / 1024), "KB");
