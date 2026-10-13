"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import {
  C,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Note,
  PageHead,
  Tag,
  Toggle,
  ToggleRow,
  inputClass,
  inputStyle,
  useToast,
} from "../ui";

export interface SettingRow {
  key: string;
  label: string;
  description: string | null;
  section: string;
  /** jsonb — boolean for switches, number for limits. */
  value: boolean | number | string;
  sort: number;
}

const SECTION_TITLE: Record<string, string> = {
  access: "Access",
  general: "General",
};

// Settings that persist correctly and are shown honestly, but that nothing
// reads yet. They carry a visible badge rather than relying on prose: a blanket
// "some of these don't work" note at the top of the page taught people to
// distrust every row, including the ones that do.
const NOT_ENFORCED = new Set(["block_disposable_email"]);

// Fair use lives on /admin/usage, next to the numbers that give it meaning.
// Rendering an editable second copy here meant two controls writing one row.
// Image quality and prices live on /admin/tools for the same reason, and are a
// JSON object this page has no control for.
const HIDDEN_SECTIONS = new Set(["fair_use", "images"]);

export default function SettingsView({ rows }: { rows: SettingRow[] }) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [pending, setPending] = useState<Record<string, number>>({});

  const sections = useMemo(() => {
    const map = new Map<string, SettingRow[]>();
    for (const r of rows) {
      if (HIDDEN_SECTIONS.has(r.section)) continue;
      if (!map.has(r.section)) map.set(r.section, []);
      map.get(r.section)!.push(r);
    }
    return [...map.entries()];
  }, [rows]);

  const save = async (key: string, value: boolean | number, label: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: key,
      p_value: value,
    });
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${label} updated.`);
    router.refresh();
  };

  return (
    <>
      <PageHead
        title="Settings"
        sub="System-wide switches. Most of these you'll set once and forget."
      />

      <div className="grid gap-3.5 lg:grid-cols-2">
        {sections.map(([section, items]) => (
          <Card key={section}>
            <CardHeader>
              <CardTitle>{SECTION_TITLE[section] ?? section}</CardTitle>
            </CardHeader>
            <CardBody>
              {items.map((s) => {
                const isNumber = typeof s.value === "number";
                return (
                  <ToggleRow
                    key={s.key}
                    title={
                      NOT_ENFORCED.has(s.key) ? (
                        <span className="flex items-center gap-2 flex-wrap">
                          {s.label}
                          <Tag tone="warn">Not enforced yet</Tag>
                        </span>
                      ) : (
                        s.label
                      )
                    }
                    desc={s.description ?? undefined}
                  >
                    {isNumber ? (
                      <input
                        type="number"
                        defaultValue={Number(s.value)}
                        onChange={(e) =>
                          setPending((p) => ({ ...p, [s.key]: Number(e.target.value) }))
                        }
                        onBlur={() => {
                          const next = pending[s.key];
                          if (next !== undefined && next !== Number(s.value)) {
                            save(s.key, next, s.label);
                          }
                        }}
                        className={inputClass}
                        style={{ ...inputStyle, width: 90 }}
                      />
                    ) : (
                      <Toggle
                        on={Boolean(s.value)}
                        onChange={(next) => save(s.key, next, s.label)}
                        label={s.label}
                      />
                    )}
                  </ToggleRow>
                );
              })}
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Data protection</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="text-sm space-y-1.5">
              {[
                ["Hosting", "Supabase, EU (eu-central-1)"],
                ["Model providers", "OpenAI · Anthropic"],
                ["Prompts stored", "In tool_runs, indefinitely"],
                ["Cost telemetry", "token_usage, asset_cost, slide_cost"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span style={{ color: C.muted }}>{k}</span>
                  <span className="text-right" style={{ color: C.ink }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <Note>
                Retention and deletion policies aren&apos;t implemented yet — prompts and
                generations are kept indefinitely. Worth settling before a school&apos;s data
                protection officer asks.
              </Note>
            </div>
            <p className="text-xs mt-3" style={{ color: C.muted }}>
              Rate limits and margin warnings live on Usage &amp; margins, beside the
              numbers they act on.
            </p>
          </CardBody>
        </Card>
      </div>

      {toastNode}
    </>
  );
}
