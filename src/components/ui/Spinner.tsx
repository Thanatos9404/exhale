/** Twelve-spoke spinner in the style of developer dashboards. Decorative: callers announce state. */
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="relative inline-block" style={{ width: size, height: size }}>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="absolute top-[45%] left-[46%] h-[8%] w-[24%] rounded-full bg-current"
          style={{
            transform: `rotate(${i * 30}deg) translate(146%)`,
            animation: 'exhale-spin 1.2s linear infinite',
            animationDelay: `${-1.2 + i * 0.1}s`,
            opacity: 0.15,
          }}
        />
      ))}
    </span>
  );
}
