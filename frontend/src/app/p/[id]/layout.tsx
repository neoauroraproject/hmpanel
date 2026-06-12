import { ReactNode } from "react";

export default function SubscriptionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0e0e11] text-zinc-800 dark:text-zinc-100 font-sans antialiased selection:bg-blue-500/30">
      {children}
    </div>
  );
}
