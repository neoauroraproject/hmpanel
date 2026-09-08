"use client";

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`store-focus-ring store-cta-glow inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center rounded-[var(--store-radius,1rem)] bg-[color:var(--store-primary)] px-5 text-[15px] font-semibold text-white shadow-[0_12px_28px_-14px_var(--store-primary)] transition duration-200 hover:opacity-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`store-focus-ring inline-flex h-12 min-h-[48px] w-full cursor-pointer items-center justify-center rounded-[var(--store-radius,1rem)] border border-[color:var(--store-panel-border,#e4e4e7)] bg-[color:var(--store-panel,#fff)] px-5 text-[15px] font-semibold text-[color:var(--store-fg)] transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
