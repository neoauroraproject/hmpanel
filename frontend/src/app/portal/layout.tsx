import Script from "next/script";

/** Same early Telegram boot as /shop — covers bare /portal routes. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <Script id="tg-webapp-ready-portal" strategy="beforeInteractive">
        {`(function(){function r(){try{var w=window.Telegram&&window.Telegram.WebApp;if(w){w.ready();w.expand();}}catch(e){}}r();setTimeout(r,50);setTimeout(r,250);setTimeout(r,800);})();`}
      </Script>
      {children}
    </>
  );
}
