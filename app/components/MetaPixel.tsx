"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

/*
 * The Meta advertising pixel.
 *
 * Mounted once in app/layout.tsx, so it covers every page: the landing page,
 * the signup funnel, the tools and the admin console alike. That is what the
 * agency's specification asks for.
 *
 * WHY THE EFFECT BELOW EXISTS
 *
 * The snippet Meta supplies fires PageView once, inline, as the document loads.
 * That is correct for a traditional site and wrong for this one: every
 * navigation in the App Router is a client render against the SAME document, so
 * the inline call runs once per SESSION rather than once per page. Meta would
 * report a single PageView for a teacher who visited thirty screens, and
 * nothing would look broken. The effect is what makes the count real.
 *
 * KEYED ON PATHNAME ONLY, deliberately. Jooma's query strings are UI state
 * (?section=subscription, ?checkout=success, ?tab=) rather than distinct pages,
 * so including them would report several PageViews for one screen. Reading
 * useSearchParams() here would also force a Suspense boundary during static
 * generation, for a value this component has no use for.
 *
 * NO <noscript> FALLBACK. It only reaches visitors with JavaScript disabled,
 * who cannot use Jooma at all — every tool is a client-rendered form — and it
 * can only ever report a PageView, never a conversion.
 *
 * Unset NEXT_PUBLIC_META_PIXEL_ID renders nothing at all, which is what keeps
 * staging and local development from reporting into the live pixel. Same shape
 * as the NEXT_PUBLIC_GOOGLE_CSE_CX gate in app/components/editor/Sidebar.tsx.
 */

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export default function MetaPixel() {
  const pathname = usePathname();
  // The inline snippet already reported the page it loaded on. Without this the
  // first navigation would be counted twice.
  const firstRender = useRef(true);

  useEffect(() => {
    if (!PIXEL_ID) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Absent when the loader is still in flight or an ad blocker ate it. Not an
    // error worth reporting: a missed PageView is the least consequential thing
    // this file does, and the conversions that matter are sent server side.
    window.fbq?.("track", "PageView");
  }, [pathname]);

  if (!PIXEL_ID) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${PIXEL_ID}');
fbq('track', 'PageView');`}
    </Script>
  );
}
