import { requireSection } from "../access";
import { TOOLS } from "@/app/lib/tools";
import ToolsView, { type ModelRow, type ToolRow } from "./ToolsView";

export const dynamic = "force-dynamic";

export default async function AdminToolsPage() {
  const { supabase } = await requireSection("see_product");

  const [{ data: tools }, { data: models }] = await Promise.all([
    supabase.rpc("admin_tools"),
    supabase.rpc("admin_model_routing"),
  ]);

  // Slugs that appear in the teacher-facing tool grid. Anything configured here
  // but missing from that list is a route that exists and can burn cost while
  // being invisible to teachers — worth surfacing rather than hiding.
  const listed = new Set(TOOLS.map((t) => t.href.replace("/tools/", "")));

  return (
    <ToolsView
      rows={(tools ?? []) as ToolRow[]}
      models={(models ?? []) as ModelRow[]}
      listedSlugs={[...listed]}
    />
  );
}
