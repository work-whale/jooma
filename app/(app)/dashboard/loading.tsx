import styles from "./loading.module.css";

// The shell lives in app/(app)/layout.tsx and is NOT remounted between these
// routes, so this renders only the page body. Mounting a second AppShellV2
// here would draw a sidebar and top bar inside the real one.
//
// Today is an async server component because it reads editable copy, so
// navigation has a server round-trip to cover. Without this the route segment
// shows nothing at all while that resolves. Shapes mirror the v4 TodayView
// (greeting, time saved, Jo prompt and hints, Make something, recent work) so
// the real content lands without a layout shift. The week strip, nudge and
// timetable offer are conditional, so the skeleton leaves them out.
export default function Loading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading Today">
      <div className={styles.hello}>
        <div className={`${styles.bar} ${styles.title}`} />
        <div className={`${styles.bar} ${styles.sub}`} />
        <div className={`${styles.bar} ${styles.date}`} />
        <div className={styles.saved} />
      </div>

      <div className={styles.jo} />
      <div className={styles.hints}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={styles.hint} />
        ))}
      </div>

      <div className={styles.sech}>
        <div className={`${styles.bar} ${styles.h2}`} />
      </div>
      <div className={styles.tools}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.tool} />
        ))}
      </div>

      <div className={styles.sech}>
        <div className={`${styles.bar} ${styles.h2}`} />
      </div>
      <div className={styles.recent}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={styles.row}>
            <div className={styles.ri} />
            <div className={`${styles.bar} ${styles.rn}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
