import { habitIcon, ICON_GRID } from "@/lib/habitIcons";
import { accentOf } from "@/lib/palette";

interface HabitIconSvgProps {
  icon: string;
  size: number;
  color: string;
  className?: string;
}

/** The bare glyph, no tile behind it. */
export function HabitIconSvg({ icon, size, color, className }: HabitIconSvgProps) {
  const { paths } = habitIcon(icon);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_GRID} ${ICON_GRID}`}
      fill={color}
      className={className}
      aria-hidden
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

interface HabitTileProps {
  icon: string;
  accent: string;
  /** Tile edge in px. The glyph and corner radius scale from it. */
  size: number;
  /** Coloured shadow under the tile. Off for dense lists. */
  glow?: boolean;
  className?: string;
}

/**
 * A habit's identity mark: its accent colour as a flat tile with the glyph
 * knocked out in the accent's ink.
 *
 * Flat colour rather than a gradient is deliberate — it is the same rule the
 * Wrapped slides follow, and it keeps the glyph legible at 36px.
 */
export function HabitTile({
  icon,
  accent,
  size,
  glow = false,
  className = "",
}: HabitTileProps) {
  const a = accentOf(accent);
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: a.hex,
        boxShadow: glow ? `0 8px 24px -12px ${a.hex}` : undefined,
      }}
    >
      <HabitIconSvg icon={icon} size={Math.round(size * 0.54)} color={a.ink} />
    </span>
  );
}
