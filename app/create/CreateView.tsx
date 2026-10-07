"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GenerateModal, {
  type GenerationParams,
  type SlideshowPrefill,
} from "@/app/components/slideshow/GenerateModal";
import ComprehensionForm from "@/app/components/forms/ComprehensionForm";
import { JoActivityProvider } from "@/app/lib/JoActivityContext";
import JoActivityPanel from "@/app/components/assistant/JoActivityPanel";
import AskJoPanel from "@/app/components/guest/AskJoPanel";
import AuthGateModal from "@/app/components/guest/AuthGateModal";
import GuestResult from "@/app/components/guest/GuestResult";
import LandingNav from "@/app/components/landing/v2/LandingNav";
import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";
import type { EditorGuest } from "@/app/components/editor/EditorGuest";
import { decodePrefill, encodePrefill, validatePrefill, type ToolPrefill } from "@/app/lib/toolPrefill";
import type { Presentation, SlideJSON } from "@/app/lib/presentations";
import type { GuestAction, GuestKind } from "@/app/lib/guest-actions";
import { guestPrefillFields, guestToolName, type GuestToolSlug } from "@/app/lib/guest-tools";
import styles from "./create.module.css";

// The teacher's editor, loaded only once a deck is on its way: it is most of
// the app's editing code, and a visitor still filling in the form needs none
// of it.
const Editor = dynamic(() => import("@/app/components/editor/Editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen" style={{ backgroundColor: "var(--j-bg)" }}>
      <SlideshowLoadingAnimation label="Opening the editor" />
    </div>
  ),
});

// Ask Jo is off on the free tries while it is reworked. Jo still reads the
// topic and fills the form; only the chat beside it is hidden. Flip this back
// to show the panel again.
const SHOW_ASK_JO = false;

interface RecentRun {
  id: string;
  tool: string;
  title: string | null;
  created_at: string;
}

interface Restored {
  id: string;
  title: string | null;
  output: Record<string, unknown>;
  input: Record<string, unknown> | null;
}

function slidePrefillFrom(p: ToolPrefill | null, topic: string): SlideshowPrefill {
  const f = (p?.fields ?? {}) as Record<string, unknown>;
  return {
    topic: typeof f.topic === "string" && f.topic.trim() ? f.topic : topic,
    year: typeof f.year === "string" ? f.year : undefined,
    slideCount: typeof f.slideCount === "number" ? f.slideCount : undefined,
    additionalInstructions:
      typeof f.additionalInstructions === "string" ? f.additionalInstructions : undefined,
  };
}

export default function CreateView({
  tool,
  topic,
  recent,
  restored,
  googleSignin,
}: {
  tool: GuestToolSlug;
  topic: string;
  recent: RecentRun[];
  restored: Restored | null;
  googleSignin: boolean;
}) {
  const router = useRouter();
  const kind: GuestKind = tool === "slideshow" ? "slides" : "comprehension";
  const name = guestToolName(tool);
  const honeypot = useRef<HTMLInputElement>(null);

  // ── The sign up prompt ────────────────────────────────────────────────────
  const [gate, setGate] = useState<{ action: GuestAction | null; message: string | null } | null>(null);
  const openGate = useCallback(
    (action: GuestAction | null, message: string | null = null) => setGate({ action, message }),
    [],
  );

  // ── Jo's first read of the topic ─────────────────────────────────────────
  // One quick call that turns "Volcanoes, Year 3" into the year group, slide
  // count and so on. Never blocks for long: after nine seconds the form opens
  // with just the topic, and the visitor fills the rest themselves.
  const [prefill, setPrefill] = useState<ToolPrefill | null>(null);
  const [reading, setReading] = useState(!!topic && !restored);
  useEffect(() => {
    if (!topic || restored) return;
    let done = false;
    const controller = new AbortController();
    const giveUp = window.setTimeout(() => {
      if (!done) {
        done = true;
        controller.abort();
        setPrefill(validatePrefill({ slug: tool, fields: guestPrefillFields(tool, topic, null) }));
        setReading(false);
      }
    }, 9000);
    (async () => {
      try {
        const res = await fetch("/api/try/prefill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, topic }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { prefill?: string | null };
        const jo = data.prefill ? decodePrefill(data.prefill) : null;
        setPrefill(
          validatePrefill({ slug: tool, fields: guestPrefillFields(tool, topic, jo?.fields ?? null) }),
        );
      } catch {
        // Aborted (Jo was slow) or offline. The topic, and any year written in
        // it, still open the form where the visitor left it.
        if (!done) {
          setPrefill(validatePrefill({ slug: tool, fields: guestPrefillFields(tool, topic, null) }));
        }
      } finally {
        done = true;
        window.clearTimeout(giveUp);
        setReading(false);
      }
    })();
    return () => {
      done = true;
      controller.abort();
      window.clearTimeout(giveUp);
    };
  }, [tool, topic, restored]);

  // ── What the form says right now ─────────────────────────────────────────
  // Kept in a ref (no renders) from the wizard's and the form's own reports,
  // and sent with every Ask Jo message so Jo works from the real topic and
  // values instead of guessing, and only changes what it is asked to.
  const formNow = useRef<Record<string, unknown>>({});
  const onSnapshot = useCallback((s: object) => {
    formNow.current = s as Record<string, unknown>;
  }, []);

  // ── Slides ───────────────────────────────────────────────────────────────
  // The wizard applies a new prefill in place (see GenerateModal), so a fill
  // from Ask Jo changes only what Jo sent.
  const slidePrefill = useMemo(() => slidePrefillFrom(prefill, topic), [prefill, topic]);

  // Once Generate is pressed, or a saved deck is reopened, the page becomes the
  // teacher's own editor in guest mode (see EditorGuest): the deck streams in
  // there, and they can edit all of it. Presenting, exporting and the tools
  // that cost a model call open the sign up prompt.
  const restoredSlides = (restored?.output?.slides as SlideJSON[] | undefined) ?? null;
  const [deck, setDeck] = useState<{
    key: number;
    presentation: Presentation;
    params: GenerationParams | null;
  } | null>(() =>
    restored && restoredSlides
      ? {
          key: 0,
          presentation: {
            id: restored.id,
            title: restored.title ?? "Untitled deck",
            slides: restoredSlides,
            created_at: "",
            updated_at: "",
          },
          params: null,
        }
      : null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const startDeck = useCallback(async (params: GenerationParams) => {
    setFormError(null);
    setDeck((prev) => ({
      key: (prev?.key ?? 0) + 1,
      // No id yet: the free try's id comes back with the stream.
      presentation: { id: "", title: params.topic, slides: [], created_at: "", updated_at: "" },
      params,
    }));
    window.scrollTo({ top: 0 });
  }, []);

  const editorGuest = useMemo<EditorGuest>(
    () => ({
      gate: (action, message) => openGate(action, message ?? null),
      honeypot: () => honeypot.current?.value ?? "",
      onRefused: (message) => {
        // Back to the form they filled in, still filled in (it stays mounted
        // under the editor), with the reason in the prompt.
        setDeck(null);
        if (message) openGate("more", message);
        else setFormError("Something went wrong. Please try again.");
      },
    }),
    [openGate],
  );

  // ── Comprehension ────────────────────────────────────────────────────────
  const launch = useMemo(() => (prefill ? { prefill: encodePrefill(prefill) } : undefined), [prefill]);

  const restoredText = typeof restored?.output?.text === "string" ? (restored.output.text as string) : null;

  const onJoPrefill = useCallback(
    (p: ToolPrefill) => {
      // Jo's fields laid over what the form already says. The comprehension
      // form clears any prefillable field a new prefill leaves out, so without
      // this "make it Year 6" would also have emptied the topic.
      const now = formNow.current;
      const keep: Record<string, unknown> = {};
      for (const key of [
        "topic",
        "year",
        "yearGroup",
        "curriculum",
        "slideCount",
        "additionalInstructions",
        "numQuestions",
        "complexity",
        "differentiate",
        "differentiationLevels",
      ]) {
        const v = now[key];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) keep[key] = v;
      }
      const words = Number(now.passageWordCount);
      if (Number.isFinite(words) && words > 0) keep.passageWordCount = words;
      if (now.textSource === "own") delete keep.topic;
      setPrefill(validatePrefill({ slug: tool, fields: { ...keep, ...p.fields } }) ?? p);
    },
    [tool],
  );

  const joIntro =
    tool === "slideshow"
      ? "Hi, I'm Jo. I have filled in what I could from your topic. Change anything you like, or ask me, then press Generate on the last step."
      : "Hi, I'm Jo. I have filled in what I could from your topic. Pick the question types you want, or ask me, then press Generate.";

  const sidePanel = SHOW_ASK_JO ? (
    <AskJoPanel
      tool={tool}
      intro={joIntro}
      onPrefill={onJoPrefill}
      getContext={() => formNow.current}
    />
  ) : null;

  const other = tool === "slideshow" ? "comp" : "slides";

  return (
    <>
    {/* The editor, once there is a deck. The page stays mounted underneath,
        hidden, so a refused run lands back on the form as they left it. */}
    {deck && (
      <Editor
        key={deck.key}
        presentation={deck.presentation}
        generationParams={deck.params ?? undefined}
        guest={editorGuest}
      />
    )}

    {/* The landing page's own colours and header, so going from the hero to
        here reads as one page rather than a jump into the app. */}
    <div className={styles.page} hidden={!!deck}>
      <LandingNav email={null} name={null} fullName={null} avatarUrl={null} isAdmin={false} linkBase="/" />

      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>{restoredText ? `Your ${name}` : `Make ${tool === "slideshow" ? "a deck" : "a comprehension"}, free`}</h1>
          <p>
            Three free tries a day, no account needed. Sign up to present, export and keep everything
            you make here.
          </p>
        </div>

        <nav className={styles.tabs} aria-label="Choose a tool">
          <Link
            href={`/create?tool=slides${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`}
            className={`${styles.tab} ${tool === "slideshow" ? styles.tabOn : ""}`}
            aria-current={tool === "slideshow" ? "page" : undefined}
          >
            Slides
          </Link>
          <Link
            href={`/create?tool=comp${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`}
            className={`${styles.tab} ${tool !== "slideshow" ? styles.tabOn : ""}`}
            aria-current={tool !== "slideshow" ? "page" : undefined}
          >
            Comprehension
          </Link>
          <span className={`${styles.tab} ${styles.tabOff}`} aria-disabled="true">
            Worksheets <em>Coming soon</em>
          </span>
        </nav>

        {/* Honeypot. Off screen and out of the tab order; a person never fills it. */}
        <input
          ref={honeypot}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className={styles.trap}
          defaultValue=""
        />

        {tool === "slideshow" ? (
          <div className={sidePanel ? styles.grid : undefined}>
            <main className={styles.main}>
              {reading ? (
                <div className={styles.reading} role="status">
                  <span className={styles.readingDot} aria-hidden="true" />
                  Jo is reading your topic
                </div>
              ) : (
                <>
                  {formError && (
                    <p className={styles.error} role="alert">
                      {formError}
                    </p>
                  )}
                  <GenerateModal
                    variant="page"
                    guest
                    prefill={slidePrefill}
                    onSnapshot={onSnapshot}
                    onClose={() => router.push("/")}
                    onSubmit={startDeck}
                  />
                </>
              )}
            </main>
            {sidePanel}
          </div>
        ) : restoredText ? (
          <div className={styles.grid}>
            <main className={styles.main}>
              <GuestResult result={restoredText} isGenerating={false} onAction={(a) => openGate(a)} />
            </main>
          </div>
        ) : reading ? (
          <div className={styles.reading} role="status">
            <span className={styles.readingDot} aria-hidden="true" />
            Jo is reading your topic
          </div>
        ) : (
          <JoActivityProvider>
            {/* No key: a new prefill from Ask Jo is applied by useToolLaunch
                over the live form, which keeps a passage already written. */}
            <ComprehensionForm
              sidebar={sidePanel}
              launch={launch}
              guest={{
                endpoint: "/api/try/comprehension",
                onSnapshot,
                extraBody: () => ({ website: honeypot.current?.value ?? "" }),
                onRefused: (_status, data) => openGate("more", data.error ?? null),
                renderResult: ({ result, isGenerating }) => (
                  <GuestResult result={result} isGenerating={isGenerating} onAction={(a) => openGate(a)} />
                ),
              }}
            />
            <JoActivityPanel />
          </JoActivityProvider>
        )}

        {recent.length > 0 && (
          <section className={styles.recent} aria-label="Your creations">
            <h2>Your creations</h2>
            <p>Saved to your account when you sign up.</p>
            <ul>
              {recent.map((r) => {
                const t = r.tool === "slideshow" ? "slides" : "comp";
                return (
                  <li key={r.id}>
                    <Link href={`/create?tool=${t}&run=${r.id}`}>
                      <b>{r.tool === "slideshow" ? "Slides" : "Comprehension"}</b>
                      <span>{r.title || "Untitled"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className={styles.switch}>
          Want the other one?{" "}
          <Link href={`/create?tool=${other}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`}>
            Try {other === "slides" ? "Slides" : "Comprehension"} instead
          </Link>
        </p>
      </div>
    </div>

    {/* Outside the page, which is hidden while the editor is open. */}
    <AuthGateModal
      open={gate !== null}
      kind={kind}
      action={gate?.action ?? null}
      message={gate?.message ?? null}
      googleSignin={googleSignin}
      onClose={() => setGate(null)}
    />
    </>
  );
}
