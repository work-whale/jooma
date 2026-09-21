"use client";

import { useRouter } from "next/navigation";
import { assistantToolFor } from "@/app/lib/assistant-tools";
import { v2ToolForSlug } from "@/app/lib/tools";
import { prefillHref, validatePrefill, type ToolClarify } from "@/app/lib/toolPrefill";

/**
 * A question Jo asks when it does not yet have enough to build well.
 *
 * The handover calls this out as one of the two behaviours that make Jo feel
 * like an assistant rather than a slot machine: when a field a tool needs is
 * ambiguous, guessing burns a generation and teaches teachers not to trust it.
 *
 * Four rules hold this to being helpful rather than an interrogation:
 *
 *   1. Answering CONTINUES the conversation rather than ending it. A chip posts
 *      its value back as an ordinary user turn, so the next tool-selection pass
 *      sees the fuller history and either asks once more or opens the tool. A
 *      teacher asked for a year group can answer and then be asked how many
 *      slides, which is what makes this a gather instead of a single question.
 *   2. Typing is always equivalent to picking. Both are just a user turn, so a
 *      teacher who wants to say something the chips do not cover simply says it.
 *   3. The teacher chooses when to stop being asked. "Open it as is" goes now
 *      with whatever was understood; "Add more detail" stays here to type. Both
 *      are added by the client, never the model, so they are always present and
 *      always worded the same.
 *   4. The ask is bounded. AssistantView counts the questions and the server
 *      withdraws the ability to ask another past the cap, so this cannot chain
 *      forever.
 *
 * Both exit routes land in the SAME validated prefill the tool card uses, so
 * there is no second path into a form to keep correct.
 */
export default function ClarifyChips({
  clarify,
  onAnswer,
  onAddDetail,
}: {
  clarify: ToolClarify;
  onAnswer?: (answer: string) => void;
  onAddDetail?: () => void;
}) {
  const router = useRouter();

  const tool = assistantToolFor(clarify.slug);
  // Unknown slug should be impossible: validateClarify rejects those. Rendering
  // nothing beats rendering a question that leads somewhere broken.
  if (!tool) return null;

  const v2 = v2ToolForSlug(clarify.slug);
  const toolName = v2?.name ?? tool.label;

  // What "Open it as is" would produce, computed up front because it decides
  // whether that button can be offered at all. validatePrefill returns null
  // when a required field is still missing, and a button that silently does
  // nothing is worse than one that explains why it cannot.
  const asIs = validatePrefill({ slug: clarify.slug, fields: clarify.fields });

  // Named so the disabled state can say what is actually missing, rather than a
  // generic "not enough detail" that leaves the teacher guessing.
  const required = (tool.fields as { required?: string[] }).required ?? [];
  const missing = required.filter((f) => clarify.fields[f] === undefined);

  return (
    <div className="mt-2.5">
      <p className="text-[12px] font-bold leading-snug" style={{ color: "var(--j-ink)" }}>
        {clarify.question}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {clarify.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onAnswer?.(option.label)}
            className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-(--j-tint) cursor-pointer"
            style={{ borderColor: "var(--j-line-2)", color: "var(--j-purple)" }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* The two ways past the question. Quieter than the chips because
          answering is the better outcome, but never hidden: a teacher who was
          already clear has to get through in one click. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!asIs}
          title={
            asIs
              ? `Open ${toolName} with what Jo has so far`
              : `Jo still needs ${missing.join(" and ")} before it can open ${toolName}`
          }
          onClick={() => {
            if (asIs) router.push(prefillHref(asIs));
          }}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-(--j-tint) disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          style={{ color: "var(--j-muted)" }}
        >
          Open it as is
        </button>

        <button
          type="button"
          onClick={() => onAddDetail?.()}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-(--j-tint) cursor-pointer"
          style={{ color: "var(--j-muted)" }}
        >
          Add more detail
        </button>
      </div>

      <p className="mt-1.5 text-[10px]" style={{ color: "var(--j-faint)" }}>
        {asIs
          ? `Answer, or open ${toolName} now and finish it yourself`
          : `Jo still needs ${missing.join(" and ")} to open ${toolName}`}
      </p>
    </div>
  );
}
