/** Exhale mark: three breath lines, the top and middle curling away like air leaving the lungs. */
export function Logo({ size = 22, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path
        d="M3 8.5h10.5a3 3 0 1 0-2.9-3.7M3 13h15a3 3 0 1 1-2.9 3.7M3 17.5h6.5"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The thin diagonal separator used between breadcrumb segments. */
export function Slash() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="shrink-0 text-line-strong"
    >
      <path d="M11 2 5 14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
