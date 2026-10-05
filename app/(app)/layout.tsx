"use client";

import AppShellV2 from "@/app/components/v2/AppShellV2";
import { AppShellProvider } from "@/app/components/v2/AppShellContext";
import UpgradeGate from "@/app/components/UpgradeGate";
import GuestClaimer from "@/app/components/guest/GuestClaimer";
import ThenAction from "@/app/components/guest/ThenAction";
import FreshSharePrompt from "@/app/components/guest/FreshSharePrompt";

/*
 * One shell for the signed-in teacher pages.
 *
 * This exists to stop the sidebar blanking on every navigation. AppShellV2 used
 * to be mounted INSIDE each page, so moving between Today, Library, Timetable,
 * Colleagues and Profile unmounted the whole rail and built it again: the
 * resource and colleague counts refetched, the credit meter and level box reset
 * to their loading state, and the nav flashed empty in between. Mounted here,
 * the shell is not remounted when you navigate between the routes below, so it
 * simply stays on screen and holds its state.
 *
 * A route group, so none of the URLs change: /dashboard is still /dashboard.
 *
 * Pages set their own title through useAppShell() rather than a prop, because a
 * prop would have to come from this layout, which cannot know which page is
 * rendering. See AppShellContext.
 *
 * /tools and /assistant keep their own layouts. They already mount the shell in
 * a layout, so they do not have this bug, and folding them in means reconciling
 * their extra chrome. That is a separate change.
 */

export default function AppRoutesLayout({ children }: { children: React.ReactNode }) {
  return (
    // "Today" is only the pre-hydration title, replaced by the page's own
    // useAppShell() call. Every route here sets one.
    <AppShellProvider defaultTitle="Today">
      {/* Mounted once for all these routes. Pages under /tools inherit the one
          in app/tools/layout.tsx instead. */}
      <AppShellV2 slot={<UpgradeGate />}>{children}</AppShellV2>
      {/* Free tries from /create, claimed on the first signed in page, and the
          action the visitor pressed before signing up. Both no-ops otherwise. */}
      <GuestClaimer />
      <ThenAction />
      <FreshSharePrompt />
    </AppShellProvider>
  );
}
