import { requireSection } from "../access";
import SettingsView, { type SettingRow } from "./SettingsView";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { supabase } = await requireSection("see_admin");
  const { data } = await supabase.rpc("admin_settings");

  return <SettingsView rows={(data ?? []) as SettingRow[]} />;
}
