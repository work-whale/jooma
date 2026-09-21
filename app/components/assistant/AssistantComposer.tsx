"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Loader2, Mic, Paperclip, Plus, X } from "lucide-react";
import { ASSISTANT_TOOLS } from "@/app/lib/assistant-tools";
import { V2_CATEGORIES, v2ToolForSlug } from "@/app/lib/tools";

export interface Attachment {
  source: string;
  text: string;
}

interface Props {
  onSend: (message: string, opts: { tool: string | null; attachment: Attachment | null }) => void;
  busy?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Compact single-row layout for the dashboard card. */
  compact?: boolean;
  autoFocus?: boolean;
}

// The Web Speech API is still vendor-prefixed in Chromium and absent in Firefox,
// and TypeScript's DOM lib does not declare it. Typed minimally rather than
// pulling in a dependency for one optional affordance.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export default function AssistantComposer({
  onSend,
  busy = false,
  disabled = false,
  placeholder = "Ask Jo anything…",
  compact = false,
  autoFocus = false,
}: Props) {
  const [value, setValue] = useState("");
  const [tool, setTool] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canDictate, setCanDictate] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Feature-detected after mount, never during render: the server has no
  // window, so deciding this at render time would produce a hydration mismatch.
  useEffect(() => {
    setCanDictate(speechRecognition() !== null);
  }, []);

  // Grow with the content, up to a ceiling — beyond that the textarea scrolls
  // rather than pushing the conversation off screen.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, compact ? 120 : 200)}px`;
  }, [value, compact]);

  useEffect(() => {
    // Stop the microphone if this unmounts mid-dictation, or it keeps listening
    // after the component is gone.
    return () => recognitionRef.current?.stop();
  }, []);

  const blocked = disabled || busy;

  const submit = () => {
    const message = value.trim();
    if (!message || blocked) return;
    onSend(message, { tool, attachment });
    setValue("");
    // The attachment is consumed by the turn it was sent with. Keeping it would
    // silently re-send the same document with every later message.
    setAttachment(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter breaks the line — the convention in every chat
    // interface a teacher already uses.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      // Reuses the slideshow generator's extractor: PDF via unpdf with an
      // OpenAI OCR fallback for scans, DOCX via mammoth, TXT as-is.
      const res = await fetch("/api/extract-resource", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that file");
      setAttachment({ source: data.source, text: data.text });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read that file");
    } finally {
      setUploading(false);
    }
  };

  const toggleDictation = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = speechRecognition();
    if (!recognition) return;

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-GB";
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => event.results[i][0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        // Append rather than replace: dictation often supplements typing.
        setValue((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    // Marked so "Add more detail" on a clarifying question can put the cursor
    // back here. The textarea is private to this component, so the alternative
    // is threading a ref through every surface that renders a composer.
    <div className="w-full" data-jo-composer>
      {attachment && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <Paperclip className="w-3.5 h-3.5 shrink-0 text-muted" />
          <span className="truncate flex-1 text-dark">{attachment.source}</span>
          <button
            type="button"
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
            className="p-0.5 rounded hover:bg-gray-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>
      )}

      {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}

      <div
        className="rounded-2xl border bg-white px-5 py-3"
        style={{ borderColor: "var(--j-line-2)" }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          disabled={blocked}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-sm text-dark placeholder:text-muted focus:outline-none disabled:cursor-not-allowed"
        />

        <div className={`flex items-center gap-2 ${compact ? "mt-1" : "mt-2"}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={onFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={blocked || uploading}
            title="Attach a PDF, Word document or text file"
            aria-label="Attach a document"
            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl transition-colors hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: "var(--j-tint)" }}
          >
            {uploading
              ? <Loader2 className="w-4 h-4 animate-spin text-muted" />
              : <Plus className="w-4 h-4 text-dark" />}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <ToolSelect value={tool} onChange={setTool} disabled={blocked} />

            {canDictate && (
              <button
                type="button"
                onClick={toggleDictation}
                disabled={blocked}
                title={listening ? "Stop dictating" : "Dictate"}
                aria-label={listening ? "Stop dictating" : "Dictate"}
                aria-pressed={listening}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{ backgroundColor: listening ? "var(--j-purple)" : "var(--j-tint)" }}
              >
                <Mic className={`w-4 h-4 ${listening ? "text-white animate-pulse" : "text-dark"}`} />
              </button>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={blocked || !value.trim()}
              aria-label="Send"
              className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl bg-(--j-purple) text-white transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The tool picker, as a native <select> styled as a pill.
 *
 * Replaced the Level and Tone pills, which looked like controls and were not:
 * `level` reached only the reply prompt and never the tool-selection pass, so
 * choosing "Year 5" could not prefill a year group on the tool Jo opened. The
 * year group is extracted from the sentence instead, which is the path that
 * actually fills the form.
 *
 * Naming a tool in prose does not bind the router: production has a teacher
 * writing "Create me a slideshow from the slideshow tool" and still being sent
 * to a deprecated one. A pill binds it, because the slug is forced server-side
 * rather than suggested to a model.
 *
 * Empty means auto-select, which is the existing behaviour untouched.
 *
 * Deliberately native rather than the hand-rolled menu pattern used elsewhere:
 * it is keyboard accessible for free, closes on outside click for free, and on
 * a phone it opens the platform picker.
 */
function ToolSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  // Grouped by category, in the same order the Make grid uses, because 35 flat
  // options is a wall. Labelled with the short V2 name ("Quizzes") so the pill
  // reads the way the rest of the product names its tools, falling back to the
  // registry's own label for a tool with no V2 entry.
  const groups = useMemo(() => {
    const byCategory = new Map<string, { slug: string; name: string }[]>();
    for (const tool of ASSISTANT_TOOLS) {
      const v2 = v2ToolForSlug(tool.slug);
      const category = v2?.category ?? "other";
      const entry = { slug: tool.slug, name: v2?.name ?? tool.label };
      const existing = byCategory.get(category);
      if (existing) existing.push(entry);
      else byCategory.set(category, [entry]);
    }
    const ordered: { id: string; name: string; tools: { slug: string; name: string }[] }[] =
      V2_CATEGORIES.filter((c) => byCategory.has(c.id)).map((c) => ({
        id: c.id,
        name: c.name,
        tools: byCategory.get(c.id)!.sort((a, b) => a.name.localeCompare(b.name)),
      }));
    // Anything without a V2 category still has to be reachable, or a registered
    // tool would be silently unpickable.
    const loose = byCategory.get("other");
    if (loose) {
      ordered.push({ id: "other", name: "Other", tools: loose.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return ordered;
  }, []);

  return (
    <select
      value={value ?? ""}
      disabled={disabled}
      aria-label="Tool"
      title="Pick a tool, or leave it to Jo"
      onChange={(e) => onChange(e.target.value || null)}
      className="h-9 max-w-40 rounded-xl border bg-white px-3 text-[13px] font-semibold text-dark focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
      style={{ borderColor: "var(--j-tint)" }}
    >
      {/* Not "None": the empty choice is an instruction to Jo, not an absence. */}
      <option value="">Auto</option>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.name}>
          {group.tools.map((tool) => (
            <option key={tool.slug} value={tool.slug}>{tool.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
