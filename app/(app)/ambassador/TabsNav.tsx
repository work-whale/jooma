"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bank, ChartLineUp, CurrencyGbp, FileText, Receipt } from "@phosphor-icons/react";
import s from "@/app/components/ambassador/programme.module.css";

const TABS = [
  { href: "/ambassador", label: "Dashboard", Icon: ChartLineUp },
  { href: "/ambassador/earnings", label: "Earnings", Icon: CurrencyGbp },
  { href: "/ambassador/statements", label: "Statements", Icon: Receipt },
  { href: "/ambassador/payout", label: "Payout details", Icon: Bank },
  { href: "/ambassador/agreement", label: "My agreement", Icon: FileText },
];

/** The five tabs. Links, so each prefetches and the back button walks them. */
export default function TabsNav() {
  const pathname = usePathname();
  return (
    <nav className={s.tabs} aria-label="Ambassador">
      {TABS.map(({ href, label, Icon }) => {
        const on = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`${s.tab} ${on ? s.tabOn : ""}`}
          >
            <Icon size={15} weight="fill" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
