import type { ChartKind } from "./insightRequest";
import type { HabitAnalytics } from "./analytics";

/**
 * Whether a chart the model asked for can honestly be drawn.
 *
 * The model picks a chart from a menu without being told which ones this
 * particular habit supports, so it will sometimes pick a weekday breakdown for
 * a monthly habit or a recovery split for someone who has never missed. The
 * chart would render — as a row of zeroes, or an empty bar — and read as a bug
 * in the app rather than a mismatch in the request.
 *
 * Dropping the chart and keeping the paragraph is the right failure: the prose
 * stands on its own, and an observation with no picture beside it looks
 * deliberate.
 */
export function chartAvailable(kind: ChartKind, stats: HabitAnalytics): boolean {
  switch (kind) {
    case "automaticity":
      // Weekly and monthly habits accumulate repetitions far too slowly for
      // the curve to mean anything, which `applicable` already encodes.
      return stats.automaticity.applicable;
    case "trend":
      // One point is not a direction of travel.
      return stats.trend.length >= 2;
    case "weekday":
      // Only daily habits have a weekday profile, and only an uneven one is
      // worth a chart — a flat seven bars illustrates nothing.
      return (
        stats.cadence === "daily" &&
        stats.weekdays.length > 0 &&
        stats.weekdays.some((d) => d.rate !== stats.weekdays[0].rate)
      );
    case "recovery":
      // The bar renders nothing at all without a miss to split.
      return stats.recovery.recovered + stats.recovery.slipped > 0;
  }
}
