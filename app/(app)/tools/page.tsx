import { createClient } from "@/app/lib/auth/server";
import { disabledToolSlugs } from "@/app/lib/tool-availability";
import { resolveCurriculum } from "@/app/lib/curricula/server";
import { hiddenToolSlugs } from "@/app/lib/curricula/tool-scope";
import ToolsGrid from "./ToolsGrid";

// Server shell so the grid never advertises a tool an admin has switched off.
// The filtering has to happen before render: doing it in the client component
// would paint the disabled tools and then remove them, which looks broken.
//
// This is presentation only. The actual enforcement — blocking the tool page
// and refusing the API — lives in proxy.ts, which is the path that cannot be
// bypassed from a browser.
export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const supabase = await createClient();
  const [disabled, curriculum] = await Promise.all([disabledToolSlugs(supabase), resolveCurriculum(null)]);
  // Tools built only for UK schools are left out for a teacher on another
  // school system, the same way: before render, so nothing flashes.
  const hidden = [...Array.from(disabled), ...hiddenToolSlugs(curriculum)];

  return <ToolsGrid disabledSlugs={hidden} />;
}
