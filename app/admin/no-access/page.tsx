import { requireAdmin } from "@/app/lib/auth/admin";
import { Card, CardBody, EmptyState, PageHead } from "../ui";

// The floor of the console.
//
// Gated on requireAdmin() ONLY, and it never redirects. That is the whole point
// of it: landingPath() sends people here when their role matches no section at
// all, and a page that redirected from here could send them straight back to
// whatever bounced them. Every other gate points away from /admin; this one
// points nowhere.
//
// Reachable in practice when someone's last section permission is switched off
// while they are signed in.
export const dynamic = "force-dynamic";

export default async function AdminNoAccessPage() {
  await requireAdmin();

  return (
    <>
      <PageHead title="Admin" sub="You are signed in as an admin." />
      <Card>
        <CardBody>
          <EmptyState
            title="No access to this section"
            body="Your role does not include this area. Ask an owner to change your permissions if you need it."
          />
        </CardBody>
      </Card>
    </>
  );
}
