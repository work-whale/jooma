"use client";

// Ask Jo, beside a generated resource: a docked panel on a wide screen that
// folds down to a slim strip, and a button that opens a sheet on a phone.
// Everything the conversation does lives in useJoSession; this only draws it.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChatTeardropDots } from "@phosphor-icons/react/dist/ssr";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleSlash,
  Loader2,
  PanelRightClose,
  Square,
  Undo2,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { JoAdapter, JoMessage, useJoSession } from "./useJoSession";
import type { useJoVoice } from "./useJoVoice";
import styles from "./jo.module.css";

const OPEN_KEY = "jooma:jo-open";

type Session = ReturnType<typeof useJoSession>;
type Voice = ReturnType<typeof useJoVoice>;

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

function JoOrb({ small = false, busy = false }: { small?: boolean; busy?: boolean }) {
  return (
    <span aria-hidden="true" className={`${styles.orb}${small ? ` ${styles.orbSmall}` : ""}`} data-busy={busy}>
      <ChatTeardropDots weight="fill" />
    </span>
  );
}

export default function JoPanel({
  session,
  adapter,
  docLabel,
  starters,
  voice = null,
  guest = null,
  disabled = null,
  openSignal = 0,
  variant = "dock",
}: {
  session: Session;
  adapter: JoAdapter;
  /** What is being edited, as a teacher would say it: "worksheet". */
  docLabel: string;
  starters: string[];
  /** Null for a guest, who cannot hear Jo until they sign up. */
  voice?: Voice | null;
  guest?: { onSignUp: () => void } | null;
  /** Why Jo cannot help yet, e.g. while the sheet is still being written. */
  disabled?: string | null;
  /** Bumped by the page when a generation finishes, to open the panel. */
  openSignal?: number;
  /** "editor": a full height column beside the slide canvas. */
  variant?: "dock" | "editor";
}) {
  const { messages, busy, send, stop, undo, promptsLeft, blocked } = session;

  // ── Open or folded ──
  // The teacher's last choice, except that a finished generation opens it:
  // that is the moment Jo can help. A panel that mounts after the generation
  // has already finished (the free try draws it with the result) still counts
  // it, which is why the signal is compared with zero rather than its first
  // value.
  const [open, setOpenState] = useState(true);
  const mountSignal = useRef(openSignal);
  useEffect(() => {
    // After mount: localStorage is not there on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mountSignal.current === 0) setOpenState(readOpen());
  }, []);
  const setOpen = (on: boolean) => {
    setOpenState(on);
    try {
      window.localStorage.setItem(OPEN_KEY, on ? "1" : "0");
    } catch {
      /* the choice lasts this visit */
    }
  };
  const [seenSignal, setSeenSignal] = useState(0);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    if (openSignal > 0) setOpenState(true);
  }

  // A reply that finished while folded.
  const [unread, setUnread] = useState(false);
  const lastDone = messages.filter((m) => m.role === "assistant" && !m.pending).length;
  const [seenDone, setSeenDone] = useState(lastDone);
  if (lastDone !== seenDone) {
    setSeenDone(lastDone);
    if (!open && lastDone > seenDone) setUnread(true);
  }
  if (open && unread) setUnread(false);

  // ── Read aloud ──
  const lastReplyRef = useRef<string | null>(null);
  const latest = [...messages].reverse().find((m) => m.role === "assistant" && !m.pending && !m.error);
  useEffect(() => {
    if (!voice?.auto || !latest?.fresh || lastReplyRef.current === latest.id) return;
    lastReplyRef.current = latest.id;
    const text = spokenText(latest);
    if (text) void voice.speak(text);
  }, [latest, voice]);

  // ── Scroll to the newest ──
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ── Composer ──
  const [draft, setDraft] = useState("");
  const outOfPrompts = !!guest && promptsLeft === 0;
  const locked = !!disabled || outOfPrompts || (!!blocked && !guest);
  const submit = (text: string) => {
    if (busy || locked || !text.trim()) return;
    voice?.stop();
    void send(text);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(draft);
    }
  };

  const lastId = messages[messages.length - 1]?.id;
  const status = busy ? "Working on your " + docLabel : disabled ?? `Edits your ${docLabel} as you watch`;

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen(true)}
        hidden={open}
        aria-label="Ask Jo"
        data-testid="jo-fab"
      >
        <JoOrb small busy={busy} />
        Ask Jo
      </button>

      <aside className={styles.dock} data-open={open} data-variant={variant} aria-label="Ask Jo" data-testid="jo-panel">
        <button type="button" className={styles.rail} onClick={() => setOpen(true)} aria-label="Open Ask Jo" data-testid="jo-rail">
          <JoOrb busy={busy} />
          {unread && <span className={styles.unread} aria-label="New reply" />}
          <span className={styles.railLabel}>Ask Jo</span>
        </button>

        <div className={styles.body}>
          <header className={styles.head}>
            <JoOrb busy={busy} />
            <div className={styles.headText}>
              <b>Ask Jo</b>
              <span role="status">{status}</span>
            </div>
            {voice ? (
              <button
                type="button"
                className={styles.iconBtn}
                aria-pressed={voice.auto}
                onClick={() => {
                  if (voice.auto) voice.stop();
                  voice.setAuto(!voice.auto);
                }}
                title={voice.auto ? "Stop reading Jo's replies aloud" : "Read Jo's replies aloud. Jo's voice is computer generated."}
                aria-label="Read Jo's replies aloud"
                data-testid="jo-voice-toggle"
              >
                {voice.auto ? <Volume2 /> : <VolumeX />}
              </button>
            ) : (
              guest && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={guest.onSignUp}
                  title="Sign up to hear Jo read replies aloud"
                  aria-label="Sign up to hear Jo"
                >
                  <VolumeX />
                </button>
              )
            )}
            <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Minimise Ask Jo" data-testid="jo-minimise">
              <PanelRightClose />
            </button>
          </header>

          <div className={styles.list} ref={listRef} aria-live="polite" data-testid="jo-messages">
            {messages.length === 0 && (
              <div className={styles.hello}>
                <JoOrb />
                <p>
                  <b>Hi, I&apos;m Jo.</b>{" "}
                  {`Tell me what to change on this ${docLabel} and I'll do it right here, so you can watch each edit happen. Not quite right? Undo it in one click.`}
                </p>
                <div className={styles.starters}>
                  {starters.map((s) => (
                    <button key={s} type="button" className={styles.starter} onClick={() => submit(s)} disabled={busy || locked}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className={styles.user} data-testid="jo-user-message">
                  {m.text}
                </div>
              ) : (
                <JoReply
                  key={m.id}
                  m={m}
                  latest={m.id === lastId}
                  busy={busy}
                  locked={locked}
                  onAnswer={submit}
                  onUndo={() => undo(m.id)}
                  onReveal={(focus) => adapter.reveal(focus)}
                  voice={voice}
                />
              ),
            )}
          </div>

          <div className={styles.composer}>
            {outOfPrompts || (guest && blocked) ? (
              <div className={styles.signup} data-testid="jo-signup">
                <b>Keep going with Jo</b>
                <p>Sign up free to keep editing with Jo. Your work comes with you.</p>
                <button type="button" onClick={guest?.onSignUp}>
                  Sign up free
                </button>
              </div>
            ) : blocked ? (
              <p className={styles.note} role="alert">
                {blocked}
              </p>
            ) : (
              <>
                <div className={styles.inputRow}>
                  <textarea
                    className={styles.input}
                    rows={1}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={disabled ? disabled : `Ask Jo to change this ${docLabel}`}
                    disabled={!!disabled}
                    aria-label="Message Jo"
                    data-testid="jo-input"
                  />
                  {busy ? (
                    <button type="button" className={styles.send} data-stop="true" onClick={stop} aria-label="Stop Jo" data-testid="jo-stop">
                      <Square />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.send}
                      onClick={() => submit(draft)}
                      disabled={!draft.trim() || locked}
                      aria-label="Send to Jo"
                      data-testid="jo-send"
                    >
                      <ArrowUp />
                    </button>
                  )}
                </div>
                {guest && promptsLeft !== null && (
                  <div className={styles.meta} data-testid="jo-prompts-left">
                    <span>
                      <b>{promptsLeft}</b> free {promptsLeft === 1 ? "message" : "messages"} with Jo left
                    </span>
                  </div>
                )}
              </>
            )}
            {voice?.error && <p className={styles.note}>{voice.error}</p>}
          </div>
        </div>
      </aside>
    </>
  );
}

/** What Jo says aloud for a reply: never the list of edits. */
function spokenText(m: JoMessage): string {
  return [m.text, m.clarify?.question, m.summary].filter(Boolean).join(" ");
}

function JoReply({
  m,
  latest,
  busy,
  locked,
  onAnswer,
  onUndo,
  onReveal,
  voice,
}: {
  m: JoMessage;
  latest: boolean;
  busy: boolean;
  locked: boolean;
  onAnswer: (text: string) => void;
  onUndo: () => void;
  onReveal: (focus: string) => void;
  voice: Voice | null;
}) {
  const steps = m.steps ?? [];
  const working = steps.some((s) => s.state === "working");
  const done = steps.filter((s) => s.state === "done").length;
  const [openSteps, setOpenSteps] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const spoken = spokenText(m);
  const speaking = voice?.playing === spoken;

  return (
    <div className={styles.jo} data-testid="jo-reply">
      <JoOrb small busy={m.pending} />
      <div className={styles.joBody}>
        {m.error ? (
          <p className={styles.joError} role="alert">
            {m.error}
          </p>
        ) : m.text ? (
          <p className={styles.joText}>{m.text}</p>
        ) : (
          m.pending && (
            <span className={styles.thinking} aria-label="Jo is reading your work">
              <i />
              <i />
              <i />
            </span>
          )
        )}

        {steps.length > 0 && (
          <div className={styles.changes} data-testid="jo-changes">
            <div className={styles.changesHead}>
              <button type="button" className={styles.changesToggle} onClick={() => setOpenSteps((o) => !o)} aria-expanded={openSteps}>
                {working ? <Loader2 className={styles.spin} /> : openSteps ? <ChevronDown /> : <ChevronRight />}
                {working || m.pending ? "Jo is editing" : `${done} ${done === 1 ? "change" : "changes"}`}
              </button>
              {!m.pending && m.before !== undefined && done > 0 &&
                (m.undone ? (
                  <span className={styles.undone}>Undone</span>
                ) : (
                  <button type="button" className={styles.undo} onClick={onUndo} disabled={busy} data-testid="jo-undo">
                    <Undo2 /> Undo
                  </button>
                ))}
            </div>
            {openSteps && (
              <ul className={styles.steps}>
                {steps.map((s, i) => (
                  <li key={i}>
                    {s.state === "done" && s.focus ? (
                      <button type="button" className={styles.step} data-state={s.state} onClick={() => onReveal(s.focus!)} title="Show me">
                        <Check />
                        {s.label}
                        <ChevronRight className={styles.stepGo} />
                      </button>
                    ) : (
                      <span className={styles.step} data-state={s.state}>
                        {s.state === "working" ? <Loader2 className={styles.spin} /> : s.state === "done" ? <Check /> : <CircleSlash />}
                        {s.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {m.summary && <p className={styles.joText}>{m.summary}</p>}

        {m.clarify && (
          <div className={styles.ask} data-testid="jo-question">
            <p>{m.clarify.question}</p>
            <div className={styles.options}>
              {m.clarify.options.map((o) =>
                m.clarify!.multi ? (
                  <button
                    key={o}
                    type="button"
                    className={styles.option}
                    aria-pressed={picked.includes(o)}
                    disabled={!latest || busy || locked}
                    onClick={() => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}
                  >
                    {o}
                  </button>
                ) : (
                  <button key={o} type="button" className={styles.option} disabled={!latest || busy || locked} onClick={() => onAnswer(o)}>
                    {o}
                  </button>
                ),
              )}
            </div>
            {latest && (
              <div className={styles.askFoot}>
                <span>Or type your own answer below</span>
                {m.clarify.multi && (
                  <button type="button" className={styles.askSend} disabled={picked.length === 0 || busy || locked} onClick={() => onAnswer(picked.join(", "))}>
                    Send
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {voice && !m.pending && !m.error && spoken && (
          <div className={styles.msgTools}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => (speaking ? voice.stop() : void voice.speak(spoken))}
              aria-label={speaking ? "Stop reading" : "Read aloud"}
              title={speaking ? "Stop reading" : "Read aloud"}
              data-testid="jo-speak"
            >
              {speaking && voice.loading ? <Loader2 className={styles.spin} /> : speaking ? <Square /> : <Volume2 />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
