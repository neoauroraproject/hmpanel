import { ReactNode } from "react";

export default function SubscriptionLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen font-sans antialiased selection:bg-blue-500/30">
      {children}
    </div>
  );
}
