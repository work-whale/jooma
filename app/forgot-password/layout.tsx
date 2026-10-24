import type { Metadata } from "next";

// The page is a client component, so its metadata lives here. noindex because
// it only sends a password link: there is nothing on it anybody searches for, and
// Search Console was already listing /login as an indexed result. follow, so
// the links on it still count.
export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
