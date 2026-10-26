import { Suspense } from "react";
import Tabs from "@/app/account/billing/Tabs";
import { asTab } from "@/app/account/billing/tabs-shared";
import { TabSkeleton } from "@/app/account/billing/Skeletons";
import OverviewTab from "@/app/account/billing/OverviewTab";
import UsageTab from "@/app/account/billing/UsageTab";
import HistoryTab from "@/app/account/billing/HistoryTab";

// Subscription — the former Usage & Billing page, as a section of /profile.
//
// Everything here is IMPORTED from app/account/billing rather than copied. Those
// components carry real logic — the de-duplication window in HistoryTab, the
// plan/period reads in OverviewTab, the Stripe portal flows in the buttons — and
// a second copy would be a second thing to keep correct. /account/billing itself
// is now a redirect into this section; the files stay where they are because
// they are still about billing.
export default async function SubscriptionSection({
  tab: rawTab,
  checkout,
  topup,
  switchTo,
}: {
  tab?: string;
  checkout?: string;
  topup?: string;
  switchTo?: string;
}) {
  const tab = asTab(rawTab);

  return (
    <div>
      {/* basePath keeps the strip inside /profile, so a tab click carries
          ?section=subscription along rather than bouncing through the redirect. */}
      <Tabs active={tab} basePath="/profile" />

      {/* key={tab} for the same reason the section boundary on page.tsx has one:
          all three tabs render into this position, so without it React reuses
          the resolved boundary and leaves the previous tab on screen until the
          new data lands. See docs/instant-navigation-guide.md §11. */}
      <Suspense key={tab} fallback={<TabSkeleton tab={tab} />}>
        {tab === "overview" && <OverviewTab checkout={checkout} topup={topup} switchTo={switchTo} />}
        {tab === "usage" && <UsageTab />}
        {tab === "history" && <HistoryTab />}
      </Suspense>
    </div>
  );
}
