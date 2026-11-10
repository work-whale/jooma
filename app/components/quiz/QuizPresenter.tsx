"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Pause, Play, Timer, X } from "lucide-react";
import type { QuizDoc } from "@/app/lib/quiz/quiz";

/*
 * A quiz on the classroom board: one question per screen, large enough to read
 * from the back of the room, answers revealed when the teacher is ready.
 *
 *   Space or Enter  reveal the answer; again for the next question
 *   Arrow keys      previous and next
 *   P               pause or restart the countdown
 *   T               turn the countdown on or off
 *   Escape          close
 *
 * The countdown is the quiz's time limit, off when it has none; at zero the
 * answer is revealed. Loaded only when a teacher presses Present, so none of
 * this weighs on the quiz page.
 */

const LETTERS = "ABCDE";
/** Option tiles in the brand's palette, one colour per letter. */
const TILE = ["#5B2ED6", "#0F8A63", "#C2551F", "#1D6FD0", "#C43D6B"];

export default function QuizPresenter({ quiz, onClose }: { quiz: QuizDoc; onClose: () => void }) {
  const total = quiz.questions.length;
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [timerOn, setTimerOn] = useState(quiz.timeLimit !== null);
  const [left, setLeft] = useState(quiz.timeLimit ?? 0);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const done = index >= total;
  const q = quiz.questions[index];

  const go = useCallback(
    (to: number) => {
      const next = Math.max(0, Math.min(total, to));
      setIndex(next);
      setRevealed(false);
      setLeft(quiz.timeLimit ?? 0);
      setPaused(false);
      setAnnounce("");
    },
    [total, quiz.timeLimit],
  );

  const advance = useCallback(() => {
    if (done) return;
    if (!revealed) setRevealed(true);
    else go(index + 1);
  }, [done, revealed, go, index]);

  // Fullscreen where the browser allows it; the overlay covers the page
  // either way, so nothing breaks when it does not.
  useEffect(() => {
    const el = rootRef.current;
    el?.focus();
    el?.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); advance(); }
      else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(index + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(index - 1); }
      else if (e.key.toLowerCase() === "p" && timerOn) setPaused((p) => !p);
      else if (e.key.toLowerCase() === "t" && quiz.timeLimit !== null) setTimerOn((t) => !t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, go, index, onClose, timerOn, quiz.timeLimit]);

  // The countdown: a second at a time, stopping at zero, which reveals.
  const counting = timerOn && !paused && !revealed && !done && quiz.timeLimit !== null;
  useEffect(() => {
    if (!counting) return;
    const t = setTimeout(() => {
      const next = left - 1;
      setLeft(next);
      if (next === 10) setAnnounce("10 seconds left");
      if (next <= 0) {
        setAnnounce("Time is up");
        setRevealed(true);
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [counting, left]);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${quiz.title || "Quiz"}, presenting`}
      data-testid="quiz-presenter"
      className="fixed inset-0 z-[200] flex flex-col bg-[#14102a] text-white outline-none"
    >
      <p className="sr-only" aria-live="polite">{announce}</p>

      <header className="flex items-center gap-3 px-6 py-4 text-sm text-white/70">
        <span className="font-semibold text-white truncate">{quiz.title || "Quiz"}</span>
        <span className="ml-auto tabular-nums" data-testid="quiz-progress">
          {done ? `${total} of ${total}` : `Question ${index + 1} of ${total}`}
        </span>
        {quiz.timeLimit !== null && !done && (
          <button
            type="button"
            onClick={() => setTimerOn((t) => !t)}
            aria-pressed={timerOn}
            className="flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 hover:bg-white/10 cursor-pointer"
          >
            <Timer className="w-4 h-4" aria-hidden="true" />
            {timerOn ? "Timer on" : "Timer off"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close presenter" className="rounded-full p-2 hover:bg-white/10 cursor-pointer">
          <X className="w-5 h-5" />
        </button>
      </header>

      {done ? (
        <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-5xl font-bold">End of the quiz</p>
          <p className="text-xl text-white/70">{total} questions. Well done, everyone.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => go(0)} className="rounded-full bg-white px-6 py-3 text-lg font-semibold text-[#14102a] cursor-pointer">Start again</button>
            <button type="button" onClick={onClose} className="rounded-full border border-white/40 px-6 py-3 text-lg font-semibold cursor-pointer">Close</button>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col gap-8 px-6 sm:px-12 pb-6 min-h-0 overflow-y-auto">
          <div className="flex items-start gap-6 pt-4">
            <h2 className="flex-1 text-3xl sm:text-5xl font-bold leading-tight" data-testid="quiz-question">{q.question}</h2>
            {timerOn && quiz.timeLimit !== null && (
              <div
                className={`shrink-0 grid place-items-center w-24 h-24 rounded-full border-4 text-4xl font-bold tabular-nums ${left <= 10 ? "border-[#E2457A] text-[#ff9fbf]" : "border-white/40"}`}
                data-testid="quiz-timer"
                aria-label={`${left} seconds left`}
              >
                {Math.max(0, left)}
              </div>
            )}
          </div>

          <ul className={`grid gap-4 ${q.options.length > 2 ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
            {q.options.map((opt, i) => {
              const right = q.answers.includes(i);
              const dim = revealed && !right;
              return (
                <li
                  key={i}
                  data-option={i}
                  data-correct={revealed && right ? "true" : undefined}
                  className="flex items-center gap-4 rounded-2xl px-5 py-5 text-2xl sm:text-3xl font-semibold transition-opacity motion-reduce:transition-none"
                  style={{ background: TILE[i % TILE.length], opacity: dim ? 0.3 : 1, outline: revealed && right ? "4px solid #fff" : "none", outlineOffset: 3 }}
                >
                  <span className="grid place-items-center w-12 h-12 shrink-0 rounded-full bg-white/20 text-2xl">{LETTERS[i]}</span>
                  <span className="flex-1">{opt}</span>
                  {revealed && right && <span className="text-base font-bold uppercase tracking-wide">Correct</span>}
                </li>
              );
            })}
          </ul>

          {revealed && q.explanation && (
            <p className="rounded-2xl bg-white/10 px-5 py-4 text-xl text-white/90" data-testid="quiz-explanation">
              {q.explanation}
            </p>
          )}
        </main>
      )}

      {!done && (
        <footer className="flex items-center gap-3 px-6 py-4">
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous question" className="rounded-full p-3 hover:bg-white/10 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="w-6 h-6" />
          </button>
          {timerOn && quiz.timeLimit !== null && !revealed && (
            <button type="button" onClick={() => setPaused((p) => !p)} className="flex items-center gap-2 rounded-full border border-white/30 px-4 py-2 hover:bg-white/10 cursor-pointer">
              {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {paused ? "Resume" : "Pause"}
            </button>
          )}
          <button
            type="button"
            onClick={advance}
            className="ml-auto flex items-center gap-2 rounded-full bg-white px-6 py-3 text-lg font-semibold text-[#14102a] cursor-pointer"
            data-testid="quiz-advance"
          >
            {revealed ? (index + 1 === total ? "Finish" : "Next question") : "Reveal answer"}
            {revealed ? <ChevronRight className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </footer>
      )}
    </div>
  );
}
