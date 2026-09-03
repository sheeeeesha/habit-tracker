/**
 * Every icon in the app, from Phosphor, at one weight.
 *
 * Spotify's own set (Encore) is internal and has never been published, so this
 * is the closest public equivalent: geometric, drawn on a consistent grid,
 * and — the reason it beats the usual thin-outline sets here — available in
 * `bold` and `fill`. That is what sits right next to Anton display type and
 * the chunky buttons; a 2px hairline set would fight the rest of the interface.
 *
 * Imported per-icon rather than through the package barrel. The barrel pulls
 * type definitions for the whole 9,000-icon set into every file that touches
 * it, which takes `tsc` from seconds to minutes.
 */

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { CalendarX } from "@phosphor-icons/react/dist/ssr/CalendarX";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Check } from "@phosphor-icons/react/dist/ssr/Check";
import { DotsThreeVertical } from "@phosphor-icons/react/dist/ssr/DotsThreeVertical";
import { Export } from "@phosphor-icons/react/dist/ssr/Export";
import { Fire } from "@phosphor-icons/react/dist/ssr/Fire";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { PlusSquare } from "@phosphor-icons/react/dist/ssr/PlusSquare";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { X } from "@phosphor-icons/react/dist/ssr/X";

export {
  ArrowRight,
  CalendarX,
  CaretLeft,
  CaretRight,
  Check,
  DotsThreeVertical,
  Export,
  Fire,
  Plus,
  PlusSquare,
  Sparkle,
  UsersThree,
  X,
};

/**
 * The app's default icon weight. Bold holds up down to 16px and sits right
 * next to the display type.
 *
 * The one deliberate exception is the overflow menu, which uses `fill`: a
 * kebab is read as three solid dots everywhere else on a phone, and outlining
 * them at this size just looks like a rendering bug.
 */
export const ICON_WEIGHT = "bold" as const;
