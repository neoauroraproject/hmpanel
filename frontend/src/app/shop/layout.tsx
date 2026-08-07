import Script from "next/script";

/**
 * Load Telegram WebApp SDK early on storefront routes so initData / ready()
 * are available before client auto-login gates run (avoids black Mini App chrome).
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <Script id="tg-webapp-ready" strategy="beforeInteractive">
        {`(function(){function r(){try{var w=window.Telegram&&window.Telegram.WebApp;if(w){w.ready();w.expand();}}catch(e){}}r();setTimeout(r,50);setTimeout(r,250);setTimeout(r,800);})();`}
      </Script>
      {children}
    </>
  );
}
