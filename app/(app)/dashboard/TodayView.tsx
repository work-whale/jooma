"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Clock,
  Fire,
  Medal,
  ChatTeardropDots,
  ArrowRight,
  CalendarBlank,
  ShareNetwork,
  Crown,
} from "@phosphor-icons/react/dist/ssr";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { ToolTile } from "@/app/components/v2/Squircle";
import { minutesSavedFor, V2_TOOLS, v2ToolForSlug, toolSolid } from "@/app/lib/tools";
import { createChat, saveMessage } from "@/app/lib/assistantChats";
import { createClient } from "@/app/lib/auth/client";
import { useBadgeProgress } from "@/app/lib/useBadgeProgress";
import { usePlanBadge } from "@/app/lib/usePlanBadge";
import { BADGE_LEVELS } from "@/app/lib/badges";
import {
  listWeek,
  mondayOf,
  nextUnplanned,
  upcomingDays,
  dayName,
  makeItHref,
  type LessonWithResource,
} from "@/app/lib/timetable";
import ShareModal from "@/app/components/v2/ShareModal";
import type { ToolRun } from "@/app/lib/toolRuns";
import EarnedBadgesCard from "./EarnedBadgesCard";
import BadgeMedallion from "@/app/components/v2/BadgeMedallion";
import type { CopyMap } from "@/app/lib/copy";
import app from "@/app/components/v2/app.module.css";
import styles from "./TodayView.module.css";

/*
 * Today.
 *
 * The order here is the one the handover specifies, and it matters: this screen
 * starts work rather than reporting on it. Ask Jo and the tools come before the
 * numbers.
 *
 * The week panel is the last one with no data behind it: the timetable does not
 * exist, so it says so rather than rendering a zero. A zero reads as "you have
 * achieved nothing", which is discouraging and, for a feature that has not been
 * built, untrue.
 *
 * The same rule survives into the metrics now that they are real. A teacher with
 * no streak yet reads "Starts today", not "0", because making one thing in the
 * next hour genuinely does start one. The streak rule itself (weekdays,
 * weekends skipped, one weekday of grace) lives in badgeCriteria.ts.
 */

/** Six sensible starting tools for a teacher with no history yet. */
const STARTER_SLUGS = [
  "lesson-planner",
  "worksheet-generator",
  "comprehension-generator",
  "quiz-generator",
  // "slideshow", not "lesson-slideshow": the latter is not a route, so
  // v2ToolForSlug dropped it and this row only ever topped up to five.
  "slideshow",
  "cover-lesson",
];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The metric placeholder while the figures are still loading.
 *
 * An ellipsis, not an em dash: the brand bans em and en dashes in anything a
 * teacher can see, and this is on screen every time Today opens. It also reads
 * as "still coming" rather than as "nothing", which is what a dash implies.
 */
const PENDING = "…";

/*
 * The mount-time clock, as an external store.
 *
 * getSnapshot MUST return a stable reference. Handing back a fresh Date on
 * every call would make React see a changed store on every render and loop
 * forever, so the value is created once, lazily, and cached.
 *
 * The clock is only read for the greeting and the 30 day ranking window, so
 * there is nothing to subscribe to: it never changes within a visit.
 */
let clock: Date | null = null;
const subscribeToClock = () => () => {};
function getClock(): Date {
  if (!clock) clock = new Date();
  return clock;
}
/** null on the server, so the greeting renders blank rather than in the
 *  server's timezone and then changing under the teacher on hydration. */
const getServerClock = (): Date | null => null;

function greetingFor(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export default function TodayView({
  copy,
}: {
  copy: Pick<CopyMap, "dash.empty.title" | "dash.empty.body">;
}) {
  useAppShell({ title: "Today" });

  const router = useRouter();
  // Active ambassadors get the gold trim. Fails quiet: no row reads as false.
  const { ambassador } = usePlanBadge();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  /*
   * This week's lessons, for the week panel and the greeting.
   *
   * `listWeek`, never `openWeek`. Opening a week WRITES: it materialises the
   * lessons from the pattern or the week before. A teacher who has not been to
   * the Timetable yet must not quietly acquire a week of them by looking at the
   * dashboard, so materialising stays on the screen that owns it.
   *
   * A failure here leaves the array empty and the panel keeps its empty state.
   * The week is a prompt to go and plan, not something worth an error on a
   * screen that has six other things on it.
   */
  const [sharing, setSharing] = useState<ToolRun | null>(null);
  const [lessons, setLessons] = useState<LessonWithResource[]>([]);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<string | null>(null);

  /*
   * One fetch for the whole screen, shared with the sidebar and the profile.
   *
   * The run history used to be fetched here and again in ProfileHeader; the
   * badge store owns it now (1,000 rows, the same ceiling /analytics uses,
   * which covers both the 30 day ranking window and every volume badge). So
   * the streak and the badges arrive without a second query rather than a third.
   */
  const progress = useBadgeProgress();
  const { runs, earned, earnedCount } = progress;
  const loading = progress.loading;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("profiles")
        .select("first_name")
        .eq("id", uid)
        .maybeSingle();
      if (!cancelled) setFirstName(data?.first_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The week. Resolved from the browser's clock in an effect for the same
  // reason as the greeting: the server's Monday can differ from the teacher's.
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
        // Left empty on purpose. See the state declaration above.
      } finally {
        if (!cancelled) setWeekLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The clock, read on the client only.
  //
  // `new Date()` on the server is the server's clock in its own timezone, which
  // for a teacher in the evening can differ by a whole greeting, and a mismatch
  // between the server and client renders is a hydration error.
  //
  // A store rather than a setState in an effect: this hook exists precisely for
  // "external value that differs between server and client", and it gives the
  // server snapshot (null) for free without a second render. Same shape as the
  // collapse preference in the sidebar.
  const now = useSyncExternalStore(subscribeToClock, getClock, getServerClock);

  const stats = useMemo(() => {
    const minutes = runs.reduce((sum, r) => sum + minutesSavedFor(r.tool_slug), 0);
    return {
      resources: runs.length,
      // Rounded to the nearest hour. Below an hour this reads "under an hour"
      // rather than "0h", which is the same rule as the empty case.
      hours: Math.round(minutes / 60),
      minutes,
    };
  }, [runs]);

  /**
   * Six tools, ranked by this teacher's own use over the last 30 days.
   *
   * The window is measured from `now`, the mount-time clock, rather than a
   * fresh Date.now(): reading the clock during render is impure, and would give
   * this memo a different answer on every render for no benefit.
   *
   * Before `now` is set, on the server render and the first client one, the
   * window is left open rather than clamped shut — a ranking over all history
   * is a reasonable thing to show for one frame; an empty row is not.
   */
  const mostUsed = useMemo(() => {
    const cutoff = now ? now.getTime() - THIRTY_DAYS_MS : 0;
    const counts = new Map<string, number>();
    for (const run of runs) {
      if (new Date(run.created_at).getTime() < cutoff) continue;
      counts.set(run.tool_slug, (counts.get(run.tool_slug) ?? 0) + 1);
    }

    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .flatMap(([slug]) => {
        const tool = v2ToolForSlug(slug);
        return tool ? [tool] : [];
      });

    // Top up to six: first from the starters, then from the catalogue at large,
    // so a teacher who has used two tools still gets a full row rather than a
    // gap. Deduplicated against everything already chosen — the href is the
    // React key below, and a tool appearing in both the ranking and the filler
    // would render twice under the same key.
    const seen = new Set(ranked.map((t) => t.href));
    const out = [...ranked];
    for (const tool of [...STARTER_SLUGS.flatMap((s) => v2ToolForSlug(s) ?? []), ...V2_TOOLS]) {
      if (out.length >= 6) break;
      if (seen.has(tool.href)) continue;
      seen.add(tool.href);
      out.push(tool);
    }
    return out.slice(0, 6);
  }, [runs, now]);

  const recent = runs.slice(0, 5);

  // The strip shows the level being worked on. Level 1 with everything locked
  // is still worth showing: it is what there is to collect, which is the
  // question a teacher who has just arrived is actually asking.
  const currentLevel = BADGE_LEVELS[progress.level - 1] ?? BADGE_LEVELS[0]!;
  const showStrip = progress.available && !loading;

  /* The four rows of the week panel, and the lesson the greeting names.
     Both from the one fetch above. */
  const week = useMemo(
    () => (weekStart && now ? upcomingDays(lessons, weekStart, now) : []),
    [lessons, weekStart, now],
  );
  const nextGap = useMemo(
    () => (weekStart && now ? nextUnplanned(lessons, weekStart, now) : null),
    [lessons, weekStart, now],
  );

  /*
   * The line under the greeting.
   *
   * The handover asks for the next unplanned lesson here, which is the most
   * useful thing this screen can say: it names the work rather than reporting
   * on it. When the timetable has nothing to offer, either because it is empty
   * or because the week is fully planned, it falls back to the most recent
   * thing made, which is what this line said before the timetable existed.
   */
  const subline = (() => {
    if (loading || weekLoading) return "Getting your week together.";
    if (nextGap) {
      const what = nextGap.topic ? `${nextGap.subject}, ${nextGap.topic}` : nextGap.subject;
      return `${dayName(nextGap.day)}'s ${what} has nothing made for it yet.`;
    }
    if (lessons.length > 0) return "Every lesson left this week has something ready.";
    if (runs.length === 0) return "Nothing made yet. Pick a tool and see what it does.";
    const latest = v2ToolForSlug(runs[0]!.tool_slug);
    const title = runs[0]!.title?.trim();
    if (title) return `Last up: ${title}.`;
    return latest ? `Last up: a ${latest.name.toLowerCase()}.` : "Ready when you are.";
  })();

  /*
   * Hand off to Ask Jo.
   *
   * Deliberately not a second chat implementation: this creates the chat,
   * stores the opening message, and navigates to /assistant/[id], which owns
   * streaming and history. AssistantView notices a conversation that ends on a
   * user turn and answers it, so a refresh mid-answer resumes correctly too.
   *
   * Jo never generates straight from free text. It parses the intent, opens the
   * matched tool with the fields filled, and lets the teacher confirm, so a
   * misread costs nothing. That routing lives in the assistant; this is only the
   * way in.
   */
  const submitAsk = async () => {
    const q = ask.trim();
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

  return (
    <>
      <div className={`${app.hello} ${ambassador ? styles.helloAmbassador : ""}`}>
        {/* An ambassador's Today gains the verified strip and a gold hairline
            (docs/JOOMA VERSION 4/13-jooma-ambassador v2.html, screen 12). The
            gold is a trim, not a different product: everything else on the
            page is the same as every other teacher's. */}
        {ambassador && (
          <Link href="/ambassador" className={styles.verifiedStrip} data-testid="today-ambassador-strip">
            <Crown weight="fill" className={styles.verifiedIcon} />
            Verified Jooma Ambassador
          </Link>
        )}
        <p className={app.helloWhen}>
          {now
            ? now.toLocaleDateString("en-GB", { weekday: "long" }) +
              " " +
              greetingFor(now.getHours()).toLowerCase()
            : " "}
        </p>
        <h1>
          {now ? greetingFor(now.getHours()) : "Hello"}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className={app.helloSub}>{subline}</p>
      </div>

      {/* Namespaced `moAsk`, never `mo`: in the prototype a bare `.mo` also
          matched `.msg.mo` in the chat and painted every message as a purple
          card. */}
      <div className={styles.moAsk}>
        <span className={styles.moFace}>
          <ChatTeardropDots weight="fill" className={styles.moFaceIcon} />
        </span>
        <div className={styles.moText}>
          <b>Ask Jo</b>
          <p>Tell it what you need and it opens the right tool, filled in.</p>
        </div>
        <form
          className={styles.moIn}
          onSubmit={(e) => {
            e.preventDefault();
            void submitAsk();
          }}
        >
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Year 4 fractions lesson with a worksheet"
            aria-label="Ask Jo"
            disabled={asking}
            className={styles.moInput}
          />
          <button type="submit" disabled={asking || !ask.trim()} className={styles.moGo}>
            {asking ? "Starting…" : "Ask Jo"}
          </button>
        </form>
      </div>

      {askError && (
        <p className={styles.moError} role="alert">
          {askError}
        </p>
      )}

      {/* Order is the handover's: day streak, resources made, badges earned,
          time saved. The streak leads because it is the one that changes today. */}
      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricIcon} data-tone="orange">
            <Fire weight="fill" />
          </span>
          <div>
            {/* Never a zero. "Starts today" is true rather than consoling: the
                day is not over, and one resource in the next hour begins one. */}
            <b>
              {loading
                ? PENDING
                : progress.currentStreak === 0
                  ? "Starts today"
                  : progress.currentStreak === 1
                    ? "1 day"
                    : `${progress.currentStreak} days`}
            </b>
            <span className={styles.metricLabel}>Day streak</span>
          </div>
        </div>

        <div className={styles.metric}>
          <span className={styles.metricIcon} data-tone="violet">
            <FileText weight="fill" />
          </span>
          <div>
            <b>{loading ? PENDING : stats.resources}</b>
            <span className={styles.metricLabel}>Resources made</span>
          </div>
        </div>

        <div className={`${styles.metric} ${!progress.available ? styles.metricSoon : ""}`}>
          <span className={styles.metricIcon} data-tone="amber">
            <Medal weight="fill" />
          </span>
          <div>
            <b className={!progress.available ? styles.metricSoonValue : undefined}>
              {loading ? PENDING : !progress.available ? "Not yet" : earnedCount || "None yet"}
            </b>
            <span className={styles.metricLabel}>Badges earned</span>
          </div>
        </div>

        <div className={styles.metric}>
          <span className={styles.metricIcon} data-tone="green">
            <Clock weight="fill" />
          </span>
          <div>
            {/* Never a zero headline. Before the first resource there is no
                figure worth showing, and under an hour rounds to 0h, which
                reads as "this saved you nothing". */}
            <b>
              {loading
                ? PENDING
                : stats.resources === 0
                  ? "Let us find out"
                  : stats.hours === 0
                    ? "Under an hour"
                    : `${stats.hours}h`}
            </b>
            <span className={styles.metricLabel}>Time saved</span>
          </div>
        </div>
      </div>

      <div className={app.sh}>
        <div className={app.shTitle}>
          <h2>Your most used</h2>
          <span className={app.shSub}>based on the last month</span>
        </div>
        <Link href="/tools" className={app.shLink}>
          All {V2_TOOLS.length}
        </Link>
      </div>

      {/* No credit costs on these cards. Credits live in the sidebar meter and
          the account page only. */}
      <div className={styles.quick}>
        {mostUsed.map((tool) => (
          <Link key={tool.href} href={tool.href} className={styles.qt}>
            <ToolTile icon={tool.icon} solid={toolSolid(tool)} size="md" />
            <h3>{tool.name}</h3>
            <span>{tool.description}</span>
          </Link>
        ))}
      </div>

      <div className={styles.bento}>
        <section className={app.panel}>
          <div className={`${app.sh} ${styles.shFlush}`}>
            <div className={app.shTitle}>
              <h2>Pick up where you left off</h2>
            </div>
            <Link href="/folders" className={app.shLink}>
              Library
            </Link>
          </div>

          {loading ? (
            <p className={styles.quiet}>Loading…</p>
          ) : recent.length === 0 ? (
            <div className={app.empty}>
              <span className={app.emptyIcon}>
                <FileText weight="fill" />
              </span>
              <p className={app.emptyTitle}>{copy["dash.empty.title"]}</p>
              <p className={app.emptyBody}>{copy["dash.empty.body"]}</p>
            </div>
          ) : (
            <div className={app.rows}>
              {/* A div, not a button, because the row now carries two actions.
                  The title is the button that opens the run; Share sits beside
                  it. Nesting a button inside a button is invalid markup and
                  browsers resolve it by dropping one of them. */}
              {recent.map((run) => {
                const tool = v2ToolForSlug(run.tool_slug);
                return (
                  <div key={run.id} className={styles.recentRow}>
                    <button
                      type="button"
                      className={styles.recentOpen}
                      // ?run= reopens THIS run. Without it the row opened an empty
                      // tool and silently discarded what was clicked.
                      onClick={() => tool && router.push(`${tool.href}?run=${run.id}`)}
                    >
                      <ToolTile
                        icon={tool?.icon ?? "file-text"}
                        solid={toolSolid(tool)}
                        size="sm"
                      />
                      <span className={app.rowMain}>
                        <span className={`${app.rowTitle} ${styles.recentTitle}`}>
                          {run.title?.trim() || "Untitled"}
                        </span>
                        <span className={app.rowMeta}>{tool?.name ?? run.tool_slug}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={styles.recentShare}
                      onClick={() => setSharing(run)}
                      aria-label={`Share ${run.title?.trim() || "Untitled"} with colleagues`}
                    >
                      <ShareNetwork className={styles.rowGo} />
                    </button>
                    <ArrowRight className={styles.rowGo} aria-hidden="true" />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={app.panel}>
          <div className={`${app.sh} ${styles.shFlush}`}>
            <div className={app.shTitle}>
              <h2>This week</h2>
            </div>
            {week.length > 0 && (
              <Link href="/timetable" className={app.shLink}>
                Timetable
              </Link>
            )}
          </div>

          {/* No rows keeps the empty state rather than printing a zero. It is
              true for a teacher who has not set a timetable up and for one whose
              week is behind them, and it points at the thing to do next. */}
          {week.length === 0 ? (
            <div className={app.empty}>
              <span className={app.emptyIcon}>
                <CalendarBlank weight="fill" />
              </span>
              <p className={app.emptyTitle}>Your week goes here</p>
              <p className={app.emptyBody}>
                Tell Jooma what you teach and when, and this shows the lessons coming up
                and what still needs making.
              </p>
              <Link href="/timetable" className={styles.weekSetUp}>
                Set up your timetable
              </Link>
            </div>
          ) : (
            <div className={styles.week}>
              {week.map((d) => {
                const { lesson } = d;
                const tool = lesson.resource
                  ? v2ToolForSlug(lesson.resource.tool_slug)
                  : undefined;
                const href = makeItHref(lesson);
                return (
                  <div
                    key={d.day}
                    className={`${styles.day} ${d.isToday ? styles.dayNow : ""} ${
                      lesson.resource ? "" : styles.dayEmpty
                    }`}
                  >
                    <span className={styles.dayD}>
                      {d.date.toLocaleDateString("en-GB", { weekday: "short" })}
                      <b className={styles.dayDate}>{d.date.getDate()}</b>
                    </span>
                    <div className={styles.dayInfo}>
                      <p className={styles.dayTitle}>
                        {[lesson.year_group, lesson.subject].filter(Boolean).join(" ")}
                        {lesson.topic ? `, ${lesson.topic}` : ""}
                      </p>
                      <span className={styles.dayMeta}>
                        {lesson.resource
                          ? `${tool?.name ?? "Something"} ready`
                          : "Nothing made yet"}
                        {d.others > 0 ? `, and ${d.others} more` : ""}
                      </span>
                    </div>

                    {/* Make it needs a topic to fill the tool's required
                        fields. Without one the honest offer is the topic, not a
                        link that opens a form claiming to be prefilled. */}
                    {!lesson.resource &&
                      (href ? (
                        <Link href={href} className={styles.gap}>
                          Make it
                        </Link>
                      ) : (
                        <Link href="/timetable" className={styles.gap}>
                          Add a topic
                        </Link>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <EarnedBadgesCard ids={progress.justEarned} />

      <div className={app.sh}>
        <div className={app.shTitle}>
          <h2>Badges</h2>
          {showStrip && (
            <span className={app.shSub}>
              Level {progress.level}, {currentLevel.title.toLowerCase()}
            </span>
          )}
        </div>
        {showStrip && (
          <Link href="/profile?section=badges" className={app.shLink}>
            See all {progress.total}
          </Link>
        )}
      </div>
      <section className={app.panel}>
        {/* Ten grey medallions is the discouraging zero this screen avoids
            everywhere else, so a teacher with nothing yet gets the invitation
            instead. Same branch covers the migration not being applied. */}
        {!showStrip ? (
          <div className={app.empty}>
            <span className={app.emptyIcon}>
              <Medal weight="fill" />
            </span>
            <p className={app.emptyTitle}>Badges are on the way</p>
            <p className={app.emptyBody}>
              Ten levels of them, earned for the teaching habits worth building.
              Make something and the first will be along shortly.
            </p>
          </div>
        ) : (
          <ul className={styles.badgeStrip}>
            {currentLevel.badges.map((badge) => (
              <li key={badge.id} className={styles.stripItem}>
                <BadgeMedallion
                  icon={badge.icon}
                  tier={currentLevel.tier}
                  locked={!earned.has(badge.id)}
                  /* Unique per medallion: two sharing a uid means the second
                     inherits the first's gradient. */
                  uid={`strip-${badge.id}`}
                />
                <span className={styles.stripName} data-locked={!earned.has(badge.id)}>
                  {badge.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ShareModal
        open={sharing !== null}
        onClose={() => setSharing(null)}
        runId={sharing?.id}
        runTitle={sharing?.title?.trim() || "Untitled"}
      />
    </>
  );
}
