"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarBlank,
  CheckCircle,
  Clock,
  Crown,
  FileText,
  ImageSquare,
  Lightning,
  LockSimple,
  ShareNetwork,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { ToolTile } from "@/app/components/v2/Squircle";
import { V2_TOOLS, v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { isToolHiddenFor } from "@/app/lib/curricula/tool-scope";
import { useTeacherCurriculum } from "@/app/lib/useTeacherCurriculum";
import { createChat, saveMessage } from "@/app/lib/assistantChats";
import { createClient } from "@/app/lib/auth/client";
import { useBadgeProgress } from "@/app/lib/useBadgeProgress";
import { usePlanBadge } from "@/app/lib/usePlanBadge";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { useCreditMeter } from "@/app/lib/useCreditMeter";
import { estimateFor, estimateLabel } from "@/app/lib/tool-estimates";
import { whenLabel } from "@/app/lib/when-label";
import { planNudge } from "@/app/lib/today-copy";
import { p8Totals, p8View } from "@/app/lib/prompt-views";
import { ukDateKey } from "@/app/lib/prompts";
import { lastShownKey, logPrompt, markShownIn } from "@/app/lib/prompt-client";
import { useStoredFlag } from "@/app/lib/useStoredFlag";
import StartTrialButton from "@/app/components/billing/StartTrialButton";
import { listWeek, mondayOf, nextUnplanned, upcomingDays, dayName, makeItHref, type LessonWithResource } from "@/app/lib/timetable";
import ShareModal from "@/app/components/v2/ShareModal";
import type { ToolRun } from "@/app/lib/toolRuns";
import type { CopyMap } from "@/app/lib/copy";
import styles from "./TodayView.module.css";

/*
 * Today, v4 (docs/Jooma version 4.5/15-jooma-dashboard-v4.html).
 *
 * This screen starts work rather than reporting on it. In order: the greeting
 * with the date and the time saved, Ask Jo with three hints, the week (only
 * when a timetable exists: almost nobody sets one up, so there is no empty
 * state for it here), the six most used tools with what each typically costs,
 * where you left off, a plan nudge where there is one, and last a one-line
 * offer to add the timetable, which goes away when dismissed.
 *
 * Badges live on the profile page; the sidebar shows the level.
 */

/** Six sensible starting tools for a teacher with no history yet. */
const STARTER_SLUGS = [
  "slideshow",
  "worksheet-generator",
  "comprehension-generator",
  "cover-lesson",
  "lesson-planner",
  "quiz-generator",
];

/** The hints under Ask Jo. Each one starts the chat as written. */
const HINTS = [
  "Year 4 fractions worksheet",
  "Comprehension on The Highwayman",
  "Cover lesson for Year 6 science",
];

/** Tools whose decks can carry generated pictures: the orange chip. */
const PICTURE_TOOLS = new Set(["/tools/slideshow"]);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TT_OFFER_KEY = "jooma.today.ttOfferDismissed";

/*
 * The mount-time clock, as an external store. getSnapshot returns a stable
 * reference, created once; null on the server so nothing renders in the
 * server's timezone and then changes on hydration.
 */
let clock: Date | null = null;
const subscribeToClock = () => () => {};
function getClock(): Date {
  if (!clock) clock = new Date();
  return clock;
}
const getServerClock = (): Date | null => null;

function greetingFor(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

/** The three tools a locked account can still use, as the hero names them. */
const FREE_TOOLS = [
  { hero: "slides", label: "Slides", slug: "slideshow" },
  { hero: "comp", label: "Comprehension", slug: "comprehension-generator" },
  { hero: "ws", label: "Worksheet", slug: "worksheet-generator" },
] as const;

export default function TodayView({
  copy,
}: {
  copy: Pick<CopyMap, "dash.empty.title" | "dash.empty.body">;
}) {
  useAppShell({ title: "Today" });

  const router = useRouter();
  const plan = usePlanBadge();
  const credits = useCreditMeter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const access = useAccountAccess();
  const locked = access?.state === "locked";
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ToolRun | null>(null);
  const [lessons, setLessons] = useState<LessonWithResource[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  // Server snapshot "dismissed", so the offer never flashes in and out.
  const [ttDismissed, setTtDismissed] = useStoredFlag(TT_OFFER_KEY, false, true);

  // One fetch for the whole screen, shared with the sidebar and the profile.
  const progress = useBadgeProgress();
  const { runs } = progress;
  const loading = progress.loading;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase.from("profiles").select("first_name").eq("id", uid).maybeSingle();
      if (!cancelled) setFirstName(data?.first_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // `listWeek`, never `openWeek`: opening a week WRITES lessons, and looking at
  // Today must not quietly create a week of them.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const week = mondayOf(new Date());
      try {
        const rows = await listWeek(week);
        if (!cancelled) {
          setLessons(rows);
          setWeekStart(week);
        }
      } catch {
        // Left empty: the week strip simply does not show.
      } finally {
        if (!cancelled) setWeekLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const now = useSyncExternalStore(subscribeToClock, getClock, getServerClock);

  // P8 (Jooma 4.5 Step 5): this month's resources and time saved, at the
  // spec's band minutes, for everyone; "See what Pro adds" on Free and
  // Standard. Always on, so "shown" is logged once a UK day, not every visit.
  const p8Plan = access?.accountPlan ?? null;
  const p8 = useMemo(
    () => (loading || !now || !p8Plan ? null : p8View({ plan: p8Plan, ...p8Totals(runs, now) })),
    [loading, now, p8Plan, runs],
  );
  const p8Day = now ? ukDateKey(now) : null;
  useEffect(() => {
    if (p8 && p8Day && lastShownKey("P8") !== p8Day) markShownIn("P8", p8Day);
  }, [p8, p8Day]);

  // Tools built only for UK schools are never suggested to a teacher on
  // another school system. Ones they have actually used still rank.
  const { id: curriculumId } = useTeacherCurriculum();
  const offeredTools = useMemo(
    () => V2_TOOLS.filter((t) => !isToolHiddenFor(t.href.replace("/tools/", ""), curriculumId)),
    [curriculumId],
  );

  /** Six tools, ranked by this teacher's own use over the last 30 days, topped
   *  up from the starters and then the catalogue, deduplicated by href. */
  const mostUsed = useMemo(() => {
    const cutoff = now ? now.getTime() - THIRTY_DAYS_MS : 0;
    const counts = new Map<string, number>();
    for (const run of runs) {
      if (new Date(run.created_at).getTime() < cutoff) continue;
      counts.set(run.tool_slug, (counts.get(run.tool_slug) ?? 0) + 1);
    }
    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([slug]) => v2ToolForSlug(slug) ?? []);
    const seen = new Set(ranked.map((t) => t.href));
    const out = [...ranked];
    for (const tool of [...STARTER_SLUGS.flatMap((s) => v2ToolForSlug(s) ?? []), ...offeredTools]) {
      if (out.length >= 6) break;
      if (seen.has(tool.href)) continue;
      if (isToolHiddenFor(tool.href.replace("/tools/", ""), curriculumId)) continue;
      seen.add(tool.href);
      out.push(tool);
    }
    return out.slice(0, 6);
  }, [runs, now, offeredTools, curriculumId]);

  const recent = runs.slice(0, 5);

  const week = useMemo(
    () => (weekStart && now ? upcomingDays(lessons, weekStart, now) : []),
    [lessons, weekStart, now],
  );
  const nextGap = useMemo(
    () => (weekStart && now ? nextUnplanned(lessons, weekStart, now) : null),
    [lessons, weekStart, now],
  );
  const hasTimetable = lessons.length > 0;

  /* The line under the greeting: the next unplanned lesson when the timetable
     has one, otherwise where the work is. */
  const subline: React.ReactNode = (() => {
    if (loading || weekLoading) return "Getting your week together.";
    if (nextGap) {
      const what = nextGap.topic ? `${nextGap.subject}, ${nextGap.topic}` : nextGap.subject;
      return `${dayName(nextGap.day)}'s ${what} has nothing made for it yet.`;
    }
    if (hasTimetable) return <>Every lesson left this week <b>has something ready.</b></>;
    if (runs.length === 0) return <>Nothing made yet. <b>Pick a tool and see what it does.</b></>;
    return <>Everything you made this week is in your library. <b>What next?</b></>;
  })();

  const nudge = plan.loading || locked ? null : planNudge(plan.plan);
  // Generated pictures: Pro, Max and the trial (Free and Standard get library
  // photos). Before 4.5, any plan with a meter.
  const picturesOn = credits.pictures;

  /*
   * Hand off to Ask Jo: create the chat, store the opening message, and go to
   * /assistant/[id], which owns streaming and history. Jo never generates
   * straight from free text; it opens the matched tool, filled in.
   */
  const startChat = async (text: string) => {
    const q = text.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const chat = await createChat(q);
      await saveMessage({ chatId: chat.id, role: "user", content: q });
      router.push(`/assistant/${chat.id}`);
    } catch {
      setAskError("Could not start that chat. Please try again.");
      setAsking(false);
    }
  };

  const dismissOffer = () => setTtDismissed(true);

  return (
    <div className={styles.today}>
      <div className={`${styles.hello} ${plan.ambassador ? styles.helloAmbassador : ""}`}>
        {/* An ambassador's Today keeps the verified strip: a trim, not a
            different product. */}
        {plan.ambassador && (
          <Link href="/ambassador" className={styles.verifiedStrip} data-testid="today-ambassador-strip">
            <Crown weight="fill" className={styles.verifiedIcon} />
            Verified Jooma Ambassador
          </Link>
        )}
        <h1>
          {now ? greetingFor(now.getHours()) : "Hello"}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className={styles.sub} data-testid="today-subline">
          {subline}
        </p>
        <p className={styles.date}>
          {now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : " "}
        </p>
        {p8 && (
          <p className={styles.saved} data-testid="today-saved">
            <Clock weight="fill" aria-hidden />
            <span>
              {p8.text}
              {p8.link && (
                <>
                  {" "}
                  <Link
                    href="/pricing?plan=pro&from=P8"
                    className={styles.savedLink}
                    onClick={() => logPrompt("P8", "clicked", "see_pro")}
                    data-testid="prompt-P8-link"
                  >
                    {p8.link}
                  </Link>
                </>
              )}
            </span>
          </p>
        )}
      </div>

      {/* In place of Ask Jo, which cannot run without a plan. */}
      {locked && access && (
        <section className={styles.lockedCard} data-testid="locked-card">
          <div className={styles.lockedHead}>
            <div>
              <h2>{access.canStartTrial ? "Try 10 days of Pro free" : "Choose a plan to carry on"}</h2>
              <p>
                {access.canStartTrial
                  ? "No card needed. All 35 tools, exports and resources."
                  : "All 35 tools, your exports and your resources, from £4.99 a month."}
              </p>
            </div>
            {access.canStartTrial ? (
              <StartTrialButton className={styles.lockedCta} />
            ) : (
              <Link href="/pricing" className={styles.lockedCta}>
                Choose a plan
              </Link>
            )}
          </div>
          <p className={styles.lockedTries} data-testid="free-tries-left">
            You can still make these for free, but not export them.{" "}
            <b>{access.freeTriesLeft} of 3 free tries left today.</b>
          </p>
          <ul className={styles.lockedTools}>
            {FREE_TOOLS.map(({ hero, label, slug }) => {
              const tool = v2ToolForSlug(slug);
              return (
                <li key={slug}>
                  <Link href={`/free-tools?tool=${hero}`}>
                    {tool && <ToolTile icon={tool.icon} solid={toolSolid(tool)} />}
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {!locked && (
        <>
          <form
            className={styles.jo}
            onSubmit={(e) => {
              e.preventDefault();
              void startChat(ask);
            }}
          >
            <span className={styles.joIcon} aria-hidden>
              <Sparkle weight="fill" />
            </span>
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder="Tell Jo what you need"
              aria-label="Ask Jo"
              disabled={asking}
              className={styles.joInput}
            />
            <button type="submit" disabled={asking || !ask.trim()} className={styles.joGo}>
              {asking ? "Starting…" : "Ask Jo"}
            </button>
          </form>
          <div className={styles.hints}>
            {HINTS.map((h) => (
              <button key={h} type="button" onClick={() => void startChat(h)} disabled={asking}>
                {h}
              </button>
            ))}
          </div>
          {askError && (
            <p className={styles.joError} role="alert">
              {askError}
            </p>
          )}
        </>
      )}

      {/* The week, only when there is one. */}
      {week.length > 0 && (
        <section className={styles.sec} data-testid="today-week">
          <div className={styles.sech}>
            <h2>This week</h2>
            <span className={styles.note}>From your timetable</span>
            <Link href="/timetable" className={styles.link}>
              Open timetable
            </Link>
          </div>
          <div className={styles.lessons}>
            {week.map((d) => {
              const { lesson } = d;
              const href = makeItHref(lesson);
              const ready = Boolean(lesson.resource);
              return (
                <div key={d.day} className={`${styles.les} ${ready ? "" : styles.lesTodo}`}>
                  <p className={styles.when}>
                    {d.isToday ? "Today" : d.date.toLocaleDateString("en-GB", { weekday: "long" })}
                    {d.others > 0 ? `, and ${d.others} more` : ""}
                  </p>
                  <h3>{lesson.topic || lesson.subject || "A lesson"}</h3>
                  <p className={styles.meta}>{[lesson.subject, lesson.year_group].filter(Boolean).join(", ")}</p>
                  {ready ? (
                    <p className={styles.state}>
                      <CheckCircle weight="fill" aria-hidden />
                      Ready
                    </p>
                  ) : (
                    <Link href={href ?? "/timetable"} className={styles.mk}>
                      {href ? "Make it" : "Add a topic"}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.sec}>
        <div className={styles.sech}>
          <h2>Make something</h2>
          <span className={styles.note}>Your most used</span>
          <Link href="/tools" className={styles.link}>
            All {offeredTools.length} tools
          </Link>
        </div>
        <div className={styles.tools}>
          {mostUsed.map((tool) => {
            const slug = tool.href.replace("/tools/", "");
            return (
              <Link key={tool.href} href={tool.href} className={styles.tool}>
                <ToolTile icon={tool.icon} solid={toolSolid(tool)} size="md" />
                <h3>{tool.name}</h3>
                <p>{tool.description}</p>
                <span className={styles.cost}>
                  <span className={`${styles.chip} ${styles.chipRes}`}>
                    <Lightning weight="fill" aria-hidden />
                    {estimateLabel(estimateFor(slug))}
                  </span>
                  {PICTURE_TOOLS.has(tool.href) &&
                    (picturesOn ? (
                      <span className={`${styles.chip} ${styles.chipPic}`}>
                        <ImageSquare weight="fill" aria-hidden />
                        Picture slides
                      </span>
                    ) : (
                      <span className={`${styles.chip} ${styles.chipGate}`}>
                        <LockSimple weight="fill" aria-hidden />
                        Pictures on paid plans
                      </span>
                    ))}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className={styles.sec}>
        <div className={styles.sech}>
          <h2>Pick up where you left off</h2>
          <Link href="/folders" className={styles.link}>
            Library
          </Link>
        </div>
        {loading ? (
          <p className={styles.quiet}>Loading…</p>
        ) : recent.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>
              <FileText weight="fill" />
            </span>
            <h3>{copy["dash.empty.title"]}</h3>
            <p>{copy["dash.empty.body"]}</p>
          </div>
        ) : (
          <div className={styles.recent}>
            {/* A div, not a button: the row carries two actions, and a button
                inside a button is invalid markup. */}
            {recent.map((run) => {
              const tool = v2ToolForSlug(run.tool_slug);
              const title = run.title?.trim() || "Untitled";
              return (
                <div key={run.id} className={styles.row}>
                  <button
                    type="button"
                    className={styles.rowOpen}
                    // ?run= reopens THIS run, not an empty tool.
                    onClick={() => tool && router.push(`${tool.href}?run=${run.id}`)}
                  >
                    <ToolTile icon={tool?.icon ?? "file-text"} solid={toolSolid(tool)} size="sm" />
                    <span className={styles.rowMain}>
                      <b>{title}</b>
                      <span>{tool?.name ?? run.tool_slug}</span>
                    </span>
                  </button>
                  <span className={styles.rowWhen}>{now ? whenLabel(new Date(run.created_at), now) : ""}</span>
                  <button
                    type="button"
                    className={styles.rowShare}
                    onClick={() => setSharing(run)}
                    aria-label={`Share ${title}`}
                  >
                    <ShareNetwork />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {nudge && (
        <div className={styles.nudge} data-testid="today-nudge">
          <div className={styles.nudgeText}>
            <h2>{nudge.title}</h2>
            <p>{nudge.body}</p>
          </div>
          <div className={styles.nudgeAct}>
            <Link href="/pricing" className={styles.nudgeBtn}>
              {nudge.cta}
            </Link>
            <p>{nudge.price}</p>
          </div>
        </div>
      )}

      {/* One line, last thing on the page, gone once dismissed. */}
      {!weekLoading && !hasTimetable && !ttDismissed && (
        <div className={styles.ttOffer} data-testid="today-tt-offer">
          <CalendarBlank aria-hidden />
          <span className={styles.ttText}>
            <b>Add your timetable and this page knows your week.</b> Tell Jo what you teach and when, and
            anything you have not made yet shows up here.
          </span>
          <Link href="/timetable" className={styles.ttGo}>
            Set it up
          </Link>
          <button type="button" className={styles.ttNo} onClick={dismissOffer}>
            Not now
          </button>
        </div>
      )}

      <ShareModal
        open={sharing !== null}
        onClose={() => setSharing(null)}
        runId={sharing?.id}
        runTitle={sharing?.title?.trim() || "Untitled"}
        toolSlug={sharing?.tool_slug}
      />
    </div>
  );
}
