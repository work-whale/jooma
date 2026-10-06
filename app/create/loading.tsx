import styles from "./create.module.css";

/** The /create frame at once, while the page reads the guest's recent tries. */
export default function Loading() {
  return (
    <div className={styles.page}>
      <div className={styles.skelBar} />
      <div className={styles.shell}>
        <div className={styles.grid}>
          <div className={`${styles.skel} ${styles.skelMain}`} />
          <div className={`${styles.skel} ${styles.skelSide}`} />
        </div>
      </div>
    </div>
  );
}
