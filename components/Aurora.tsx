/**
 * Slow-drifting colour blobs behind the whole app — the Wrapped "poster"
 * ground that keeps flat black from feeling dead. Purely decorative.
 */
export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-ink" />
      <div
        className="absolute -top-[22vmax] -left-[18vmax] h-[58vmax] w-[58vmax] rounded-full bg-hyperpink opacity-30 blur-[90px] animate-aurora"
        style={{ animationDelay: "-3s" }}
      />
      <div
        className="absolute top-[18vh] -right-[22vmax] h-[52vmax] w-[52vmax] rounded-full bg-ultra opacity-28 blur-[90px] animate-aurora"
        style={{ animationDelay: "-11s" }}
      />
      <div
        className="absolute -bottom-[26vmax] left-[6vw] h-[50vmax] w-[50vmax] rounded-full bg-electric opacity-20 blur-[100px] animate-aurora"
        style={{ animationDelay: "-17s" }}
      />
      {/* Film grain stops the big blurs from banding on wide-gamut screens. */}
      <div
        className="absolute inset-0 opacity-[0.045] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
