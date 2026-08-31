interface ProgressRingProps {
  ratio: number;
  size?: number;
  stroke?: number;
  color: string;
  trackClassName?: string;
  children?: React.ReactNode;
}

/** Circular progress meter. Purely presentational — label it at the call site. */
export function ProgressRing({
  ratio,
  size = 96,
  stroke = 9,
  color,
  trackClassName = "stroke-white/12",
  children,
}: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{
            transition: "stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
