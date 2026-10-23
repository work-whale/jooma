"use client";

// Who does not get bulk email, and why. Everyone on this list is skipped by
// every kind except service notices.
//
// Visible to admins with see_teachers as well as send_email_campaigns, since it
// is a list of addresses. admin_email_opt_outs() and admin_set_email_opt_out()
// check both again, and every add or remove lands in the audit log.
//
// Search is a GET form so it lives in the URL (?tab=optouts&q=), the same as
// every other admin filter: page.tsx does the query and this only renders.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { parseEmailList } from "@/app/lib/email-templates/broadcast";
import { fmtDateTime, nf } from "../format";
import {
  Btn,
  C,
  Card,
  CardFooter,
  EmptyState,
  FilterBar,
  Note,
  Table,
  Tag,
  Td,
  Th,
  Tr,
  inputClass,
  inputStyle,
  useToast,
  type Tone,
} from "../ui";
import type { OptOutRow } from "./types";

const SOURCE: Record<OptOutRow["source"], { label: string; tone: Tone }> = {
  link: { label: "Unsubscribe link", tone: "plain" },
  one_click: { label: "Inbox unsubscribe", tone: "plain" },
  signup: { label: "At signup", tone: "brand" },
  profile: { label: "Profile setting", tone: "brand" },
  admin: { label: "Added by an admin", tone: "plain" },
  bounce: { label: "Bounced", tone: "warn" },
  spam: { label: "Spam complaint", tone: "danger" },
};

export default function OptOutsView({ rows, search }: { rows: OptOutRow[]; search: string }) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = async (email: string, out: boolean) => {
    setBusy(email);
    setError(null);
    const { error: e } = await createClient().rpc("admin_set_email_opt_out", {
      p_email: email,
      p_out: out,
    });
    setBusy(null);
    if (e) {
      setError(e.message);
      return false;
    }
    fire(out ? `${email} will not get bulk email.` : `${email} can get bulk email again.`);
    router.refresh();
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const [email] = parseEmailList(adding);
    if (!email) {
      setError("That does not look like an email address.");
      return;
    }
    if (await set(email, true)) setAdding("");
  };

  return (
    <>
      <div className="mb-4">
        <Note>
          Unsubscribed people are left out of marketing, information and signup reminder
          emails. Service notices still reach them. Bounces and spam complaints are added
          automatically from SendGrid. Remove someone only if they asked to hear from us again.
        </Note>
      </div>
      {error && (
        <div className="mb-4">
          <Note tone="danger">{error}</Note>
        </div>
      )}
      <Card>
        <FilterBar>
          <form method="get" action="/admin/emails" className="flex items-center gap-2">
            <input type="hidden" name="tab" value="optouts" />
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search addresses"
              aria-label="Search addresses"
              className={inputClass}
              style={inputStyle}
            />
            <Btn type="submit" size="sm">
              Search
            </Btn>
          </form>
          <form onSubmit={add} className="flex items-center gap-2 ml-auto">
            <input
              type="email"
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="name@school.org"
              aria-label="Address to unsubscribe"
              className={inputClass}
              style={inputStyle}
            />
            <Btn type="submit" size="sm" disabled={!adding.trim() || busy !== null}>
              Unsubscribe address
            </Btn>
          </form>
        </FilterBar>
        {rows.length === 0 ? (
          <EmptyState
            title={search ? "No matches" : "Nobody has unsubscribed"}
            body={search ? "No unsubscribed address contains that." : "Opt-outs appear here as they happen."}
          />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Address</Th>
                <Th>How</Th>
                <Th>When</Th>
                <Th align="right">{""}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.email}>
                  <Td>
                    <span className="font-semibold" style={{ color: C.ink }}>
                      {r.email}
                    </span>
                  </Td>
                  <Td>
                    <Tag tone={SOURCE[r.source]?.tone ?? "plain"}>{SOURCE[r.source]?.label ?? r.source}</Tag>
                  </Td>
                  <Td>
                    <span className="text-xs whitespace-nowrap" style={{ color: C.ink2 }}>
                      {fmtDateTime(r.created_at)}
                    </span>
                  </Td>
                  <Td align="right">
                    <Btn size="sm" variant="ghost" onClick={() => set(r.email, false)} disabled={busy !== null}>
                      {busy === r.email ? "Removing..." : "Remove"}
                    </Btn>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <CardFooter>
          {nf.format(rows.length)} {rows.length === 1 ? "address" : "addresses"}
          {search ? ` matching "${search}"` : ""}
        </CardFooter>
      </Card>
      {toastNode}
    </>
  );
}
