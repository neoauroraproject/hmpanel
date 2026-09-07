"use client";

/** Cut-gem mark (not Lucide's rhombus `Diamond`). */
export function PremiumGem({
  size = 12,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M4.1 2.4h7.8L14.8 6.2 8 14.6 1.2 6.2 4.1 2.4Z"
      />
      <path fill="#fff" fillOpacity="0.38" d="M4.1 2.4h7.8L8 6.4 4.1 2.4Z" />
      <path fill="#fff" fillOpacity="0.16" d="M1.2 6.2 8 6.4 8 14.6 1.2 6.2Z" />
      <path
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="0.7"
        d="M1.2 6.2h13.6M4.1 2.4 8 14.6 11.9 2.4M8 2.4v12.2"
      />
    </svg>
  );
}
