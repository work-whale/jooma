"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { renderLifecycleEmail } from "@/app/lib/lifecycle-emails";
import type { LifecycleId } from "@/app/lib/lifecycle";
import {
  LIFECYCLE_CATALOGUE,
  LIFECYCLE_SETTING_KEY,
  sampleLifecycleVars,
  type LifecycleSwitch,
} from "@/app/lib/lifecycle-switch";
import { Btn, C, Card, CardBody, CardHeader, CardTitle, Modal, Note, Tag, Toggle, useToast } from "../ui";

/*
 * The automatic teacher emails (Jooma 4.5 spec Step 6): one master switch and
 * an on/off per email, with a preview of each from sample values. Saved as
 * app_settings.lifecycle_emails through admin_set_setting (admin only, audit
 * logged); the lifecycle cron reads it every 15 minutes. Turning the master
 * switch on asks first, because it starts real sends.
 */

export default function LifecycleEmailsCard({ initial, saved }: { initial: LifecycleSwitch; saved: boolean }) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [sw, setSw] = useState<LifecycleSwitch>(initial);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<LifecycleId | null>(null);

  const save = async (next: LifecycleSwitch, done: string) => {
    setBusy(true);
    const { error } = await createClient().rpc("admin_set_setting", {
      p_key: LIFECYCLE_SETTING_KEY,
      p_value: next,
    });
    setBusy(false);
    if (error) {
      fire(error.message === "no such setting" ? "The switch is not set up on this database yet (migration 20261120000000)." : error.message);
      return;
    }
    setSw(next);
    fire(done);
    router.refresh();
  };

  const setMaster = (on: boolean) => {
    if (on) setConfirming(true);
    else void save({ ...sw, enabled: false }, "Automatic emails switched off.");
  };

  const setOne = (id: LifecycleId, on: boolean) => {
    const off = on ? sw.off.filter((x) => x !== id) : [...sw.off, id];
    void save({ ...sw, off }, `${id} switched ${on ? "on" : "off"}.`);
  };

  const shown = preview ? renderLifecycleEmail(preview, sampleLifecycleVars(), { unsubToken: "sample" }) : null;

  return (
    <Card>
      {toastNode}
      <CardHeader>
        <CardTitle>Automatic teacher emails</CardTitle>
        <Tag tone={sw.enabled ? "ok" : "plain"}>{sw.enabled ? "Sending" : "Off"}</Tag>
        <Toggle on={sw.enabled} onChange={setMaster} disabled={busy || !saved} label="Send automatic teacher emails" />
      </CardHeader>
      <CardBody>
        <p className="text-sm mb-3" style={{ color: C.muted }}>
          The trial, Free and billing emails (E1 to E14). Checked every 15 minutes. While the main switch is off,
          nothing sends; with it on, each email below sends unless it is switched off on its own. Marketing emails go
          only to teachers who ticked the box and have not unsubscribed. E16 and the Monday schools list are separate.
        </p>
        {!saved && (
          <div className="mb-3">
            <Note tone="warn">The switch is not set up on this database yet. Push migration 20261120000000 first.</Note>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="lifecycle-emails">
            <thead>
              <tr className="text-left" style={{ color: C.muted }}>
                <th className="py-2 pr-3 font-semibold">Email</th>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">To</th>
                <th className="py-2 pr-3 font-semibold" />
                <th className="py-2 font-semibold text-right">On</th>
              </tr>
            </thead>
            <tbody>
              {LIFECYCLE_CATALOGUE.map((e) => {
                const on = !sw.off.includes(e.id);
                return (
                  <tr key={e.id} className="border-t" style={{ borderColor: C.divider }} data-email={e.id}>
                    <td className="py-2 pr-3 align-top" style={{ color: C.ink }}>
                      <b>{e.id}</b>{" "}
                      {e.kind === "marketing" && <Tag tone="brand">Marketing</Tag>}
                      <div style={{ color: C.ink2 }}>{renderLifecycleEmail(e.id, sampleLifecycleVars(), { unsubToken: "sample" }).subject}</div>
                    </td>
                    <td className="py-2 pr-3 align-top" style={{ color: C.ink2 }}>{e.when}</td>
                    <td className="py-2 pr-3 align-top" style={{ color: C.ink2 }}>{e.to}</td>
                    <td className="py-2 pr-3 align-top">
                      <Btn size="sm" onClick={() => setPreview(e.id)}>Preview</Btn>
                    </td>
                    <td className="py-2 align-top text-right">
                      <Toggle on={on} onChange={(v) => setOne(e.id, v)} disabled={busy || !saved} label={`Send ${e.id}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardBody>

      {confirming && (
        <Modal
          title="Start sending to teachers?"
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Btn onClick={() => setConfirming(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  void save({ ...sw, enabled: true }, "Automatic emails switched on.");
                }}
              >
                Start sending
              </Btn>
            </>
          }
        >
          <p className="text-sm" style={{ color: C.ink }}>
            Real teachers start getting these emails from the next check, within 15 minutes. Emails that came due in the
            last 12 hours go out then; older ones are skipped, never sent late.{" "}
            {sw.off.length > 0 ? `Switched off on their own and still held: ${sw.off.join(", ")}.` : "Every email in the list is on."}
          </p>
        </Modal>
      )}

      {shown && preview && (
        <Modal title={`${preview} preview`} onClose={() => setPreview(null)} width="max-w-xl">
          <div className="space-y-3 text-sm" data-testid="lifecycle-preview">
            <p style={{ color: C.muted }}>Example values (Sam, 25 November). Real emails use each teacher&apos;s own.</p>
            <p><b>Subject:</b> {shown.subject}</p>
            <p style={{ color: C.muted }}><b>Preview line:</b> {shown.preheader}</p>
            <p style={{ color: C.ink }}>{shown.body}</p>
            <p><Tag tone="brand">{shown.button}</Tag> <span style={{ color: C.muted }}>opens {shown.path}</span></p>
            <p style={{ color: C.muted }}>Footer link: {shown.footerLabel}</p>
          </div>
        </Modal>
      )}
    </Card>
  );
}
