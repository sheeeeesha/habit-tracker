/**
 * Decorative shapes that fill the empty upper half of a story slide so each one
 * reads as a designed poster rather than text floating on a colour field.
 * They inherit the slide's ink colour and are knocked back so type stays first.
 */

const common = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SquiggleMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      <path
        d="M-20 150C40 40 110 30 160 110s90 130 150 60 90-140 130-160"
        strokeWidth="34"
        {...common}
      />
    </svg>
  );
}

export function ArcsMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      {[60, 110, 160, 210].map((r) => (
        <circle key={r} cx="290" cy="150" r={r} strokeWidth="22" {...common} />
      ))}
    </svg>
  );
}

export function DotGridMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      {Array.from({ length: 6 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => (
          <circle
            key={`${row}-${col}`}
            cx={30 + col * 45}
            cy={25 + row * 45}
            r={11 - Math.abs(row - 2.5) * 1.6}
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}

export function ChevronMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      {[0, 1, 2, 3, 4].map((i) => (
        <path
          key={i}
          d={`M${40 + i * 70} 40L${110 + i * 70} 130L${40 + i * 70} 220`}
          strokeWidth="26"
          {...common}
        />
      ))}
    </svg>
  );
}

export function BlobMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      <path
        d="M210 20c70 0 130 40 140 105s-50 115-125 120-150-25-165-90S140 20 210 20z"
        fill="currentColor"
      />
      <path
        d="M110 60c40-18 90-6 100 30s-25 66-70 60-70-72-30-90z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

export function StarMotif() {
  return (
    <svg viewBox="0 0 400 260" aria-hidden className="h-full w-full">
      {[
        [110, 90, 70],
        [280, 150, 100],
        [200, 40, 44],
      ].map(([cx, cy, r], i) => (
        <path
          key={i}
          d={`M${cx} ${cy - r}C${cx} ${cy - r * 0.2} ${cx + r * 0.2} ${cy} ${cx + r} ${cy}C${cx + r * 0.2} ${cy} ${cx} ${cy + r * 0.2} ${cx} ${cy + r}C${cx} ${cy + r * 0.2} ${cx - r * 0.2} ${cy} ${cx - r} ${cy}C${cx - r * 0.2} ${cy} ${cx} ${cy - r * 0.2} ${cx} ${cy - r}Z`}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export const MOTIFS = [
  SquiggleMotif,
  ArcsMotif,
  DotGridMotif,
  ChevronMotif,
  StarMotif,
  BlobMotif,
];
