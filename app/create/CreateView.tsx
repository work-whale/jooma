"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Wordmark from "@/app/components/v2/Wordmark";
import GenerateModal, {
  type GenerationParams,
  type SlideshowPrefill,
} from "@/app/components/slideshow/GenerateModal";
import ComprehensionForm from "@/app/components/forms/ComprehensionForm";
import { JoActivityProvider } from "@/app/lib/JoActivityContext";
import JoActivityPanel from "@/app/components/assistant/JoActivityPanel";
import AskJoPanel from "@/app/components/guest/AskJoPanel";
import AuthGateModal from "@/app/components/guest/AuthGateModal";
import GuestDeckView from "@/app/components/guest/GuestDeckView";
import GuestResult from "@/app/components/guest/GuestResult";
import {
  applyDeckEvent,
  readSseFrames,
  seedDeck,
  type DeckSlide,
} from "@/app/lib/deck-events";
import { decodePrefill, encodePrefill, validatePrefill, type ToolPrefill } from "@/app/lib/toolPrefill";
import type { SlideJSON } from "@/app/lib/presentations";
import type { GuestAction, GuestKind } from "@/app/lib/guest-actions";
import { guestPrefillFields, guestToolName, type GuestToolSlug } from "@/app/lib/guest-tools";
import styles from "./create.module.css";

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

  // ── Slides ───────────────────────────────────────────────────────────────
  // The wizard seeds itself from its prefill once, on mount, so a later fill
  // from Ask Jo remounts it with the new values.
  const [wizardKey, setWizardKey] = useState(0);
  const slidePrefill = useMemo(() => slidePrefillFrom(prefill, topic), [prefill, topic]);

  const restoredSlides = (restored?.output?.slides as SlideJSON[] | undefined) ?? null;
  const [phase, setPhase] = useState<"form" | "deck">(restoredSlides ? "deck" : "form");
  const [slides, setSlides] = useState<SlideJSON[]>(restoredSlides ?? []);
  const [deckTitle, setDeckTitle] = useState(restored?.title ?? "");
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; status?: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const startDeck = useCallback(
    async (params: GenerationParams) => {
      setFormError(null);
      setFailed(false);
      setSlides([]);
      setProgress(null);
      setDeckTitle(params.topic);

      const res = await fetch("/api/try/slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, website: honeypot.current?.value ?? "" }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (res.status === 429 || res.status === 403) {
          openGate("more", data.error ?? null);
        } else {
          setFormError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      setPhase("deck");
      setGenerating(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      const trialId = res.headers.get("x-trial-id");

      let deck: DeckSlide[] = [];
      let seeded = false;
      let completed = false;
      let title = params.topic;
      const arrived = new Map<number, SlideJSON>();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const { frames, rest } = readSseFrames(buffer);
          buffer = rest;
          for (const { event, payload } of frames) {
            const p = payload as Record<string, unknown>;
            if (event === "meta") {
              if (typeof p.title === "string" && p.title) {
                title = p.title;
                setDeckTitle(p.title);
              }
              if (!seeded && typeof p.total === "number" && p.total > 0) {
                deck = seedDeck();
                seeded = true;
                setProgress({ current: 0, total: p.total });
              }
            } else if (event === "count-correction") {
              if (typeof p.total === "number" && p.total > 0) {
                const total = p.total;
                setProgress((prev) => ({ current: prev?.current ?? 0, total }));
              }
            } else if (event === "status") {
              if (typeof p.message === "string") {
                const status = p.message;
                setProgress((prev) => (prev ? { ...prev, status } : { current: 0, total: 0, status }));
              }
            } else if (event === "error") {
              setFailed(true);
            } else {
              if (event === "slide" && typeof p.index === "number") {
                const idx = p.index;
                const total = typeof p.total === "number" ? p.total : 0;
                setProgress((prev) => ({ current: idx + 1, total: total || prev?.total || 0 }));
              }
              if (event === "complete") completed = true;
              deck = applyDeckEvent(deck, event, payload, arrived);
            }
          }
          setSlides(deck);
        }
      } catch {
        setFailed(true);
      } finally {
        setGenerating(false);
        setProgress(null);
      }

      if (!completed || deck.length === 0) {
        setFailed(true);
        return;
      }
      // Kept for the account they are about to make. The server accepts this
      // once, for this guest, for a run it saw finish.
      if (trialId) {
        await fetch("/api/try/slideshow/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: trialId, title, slides: deck }),
        }).catch(() => {});
        router.refresh();
      }
    },
    [openGate, router],
  );

  // ── Comprehension ────────────────────────────────────────────────────────
  const launch = useMemo(() => (prefill ? { prefill: encodePrefill(prefill) } : undefined), [prefill]);

  const restoredText = typeof restored?.output?.text === "string" ? (restored.output.text as string) : null;

  const onJoPrefill = useCallback(
    (p: ToolPrefill) => {
      if (tool === "slideshow") {
        // Keep the topic they started from unless Jo changed it on purpose.
        setPrefill(p);
        if (phase === "form") setWizardKey((k) => k + 1);
      } else {
        setPrefill(p);
      }
    },
    [tool, phase],
  );

  const joIntro =
    tool === "slideshow"
      ? "Hi, I'm Jo. I have filled in what I could from your topic. Change anything you like, or ask me, then press Generate on the last step."
      : "Hi, I'm Jo. I have filled in what I could from your topic. Pick the question types you want, or ask me, then press Generate.";

  const sidePanel = (
    <AskJoPanel tool={tool} intro={joIntro} onPrefill={onJoPrefill} />
  );

  const other = tool === "slideshow" ? "comp" : "slides";

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand} aria-label="Jooma home">
          <Wordmark />
        </Link>
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
        <div className={styles.barRight}>
          <Link href="/login" className={styles.barLink}>
            Log in
          </Link>
          <Link href="/signup" className={styles.barCta}>
            Start free trial
          </Link>
        </div>
      </header>

      <div className={styles.shell}>
        <div className={styles.intro}>
          <h1>{phase === "deck" || restoredText ? `Your ${name}` : `Make ${tool === "slideshow" ? "a deck" : "a comprehension"}, free`}</h1>
          <p>
            One free {name} a day, no account needed. Sign up to present, export and keep everything you
            make here.
          </p>
        </div>

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
          <div className={styles.grid}>
            <main className={styles.main}>
              {phase === "deck" ? (
                <>
                  <GuestDeckView
                    title={deckTitle}
                    slides={slides}
                    generating={generating}
                    progress={progress}
                    failed={failed}
                    onAction={(a) => openGate(a)}
                  />
                  {!generating && (
                    <div className={styles.after}>
                      <p>
                        {failed
                          ? "That one did not finish, so it does not count as your free try."
                          : "Saved for you. Sign up and it is waiting in your library, ready to present and export."}
                      </p>
                      <div>
                        {failed ? (
                          <button type="button" className={styles.afterGhost} onClick={() => setPhase("form")}>
                            Try again
                          </button>
                        ) : (
                          <button type="button" className={styles.afterGhost} onClick={() => openGate("more")}>
                            Make another
                          </button>
                        )}
                        <button type="button" className={styles.afterCta} onClick={() => openGate("export")}>
                          Start free trial
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : reading ? (
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
                    key={wizardKey}
                    variant="page"
                    guest
                    prefill={slidePrefill}
                    onClose={() => router.push("/")}
                    onSubmit={startDeck}
                  />
                </>
              )}
            </main>
            {phase === "form" && sidePanel}
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

      <AuthGateModal
        open={gate !== null}
        kind={kind}
        action={gate?.action ?? null}
        message={gate?.message ?? null}
        googleSignin={googleSignin}
        onClose={() => setGate(null)}
      />
    </div>
  );
}
