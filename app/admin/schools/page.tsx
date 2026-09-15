import { requireSection } from "../access";
import NotBuiltBanner from "../NotBuiltBanner";
import SchoolsTable, { type SchoolRow, type TrustRow } from "./SchoolsTable";

export const dynamic = "force-dynamic";

export default async function AdminSchoolsPage() {
  const { supabase } = await requireSection("see_people");

  const [{ data: schools }, { data: trusts }] = await Promise.all([
    supabase.rpc("admin_schools"),
    supabase.rpc("admin_trusts"),
  ]);

  return (
    <>
      <NotBuiltBanner>
        The School plan isn&apos;t part of the product yet — there&apos;s no
        pricing for it, no seat model on accounts, and nothing here is enforced
        at runtime. Anything you create on this page is modelling only.
      </NotBuiltBanner>
      <SchoolsTable
        rows={(schools ?? []) as SchoolRow[]}
        trusts={(trusts ?? []) as TrustRow[]}
      />
    </>
  );
}
