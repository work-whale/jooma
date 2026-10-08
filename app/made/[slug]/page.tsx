import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabase } from "@/app/lib/supabase";
import type { SlideJSON } from "@/app/lib/presentations";
import Wordmark from "@/app/components/v2/Wordmark";
import MarkdownResult from "@/app/components/MarkdownResult";
import SheetDocument from "@/app/components/sheets/SheetDocument";
import { parseSheet } from "@/app/lib/sheets/normalize";
import MadeDeck from "./MadeDeck";
import styles from "./made.module.css";

interface Item {
  slug: string;
  kind: "slides" | "comprehension" | "worksheet";
  title: string;
  subject: string | null;
  year_label: string | null;
  region: string | null;
  teacher_name: string | null;
  slides: SlideJSON[] | null;
  output: string | null;
}

/**
 * One read per request, shared by the page and its metadata. Through
 * public_showcase_item(), which returns an approved, opted in item only:
 * anything else, including a slug for something since withdrawn, is a 404.
 *
 * Called as anon, which is who the function is granted to. The service role
 * holds no execute grant on it, so every slug used to 404.
 */
const getItem = cache(async (slug: string): Promise<Item | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const { data, error } = await supabase.rpc("public_showcase_item", {
    p_slug: slug,
  });
  if (error) console.warn("[made] could not read:", error.message);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as Item;
});

const KIND = {
  slides: "Slides",
  comprehension: "Comprehension",
  worksheet: "Worksheet",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) return { title: "Not found | Jooma" };
  const by = item.teacher_name ? ` by ${item.teacher_name}` : "";
  return {
    title: `${item.title} | Made with Jooma`,
    description: `${KIND[item.kind]}${by}${item.year_label ? `, ${item.year_label}` : ""}. Made with Jooma.`,
    alternates: { canonical: `/made/${item.slug}` },
  };
}

/**
 * A resource a teacher chose to share on the landing page, with an admin's
 * approval. Public, read only, and one click from making their own.
 */
export default async function MadePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getItem(slug);
  if (!item) notFound();

  // A designed Worksheet or Comprehension is drawn as its pages.
  const sheet = parseSheet(item.output);
  const meta = [item.subject, item.year_label, item.region]
    .filter(Boolean)
    .join(" · ");
  const makeHref =
    item.kind === "slides"
      ? `/create?tool=slides&topic=${encodeURIComponent(item.title)}`
      : item.kind === "comprehension"
        ? `/create?tool=comp&topic=${encodeURIComponent(item.title)}`
        : "/signup";

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <Link href="/" className={styles.brand} aria-label="Jooma home">
          <Wordmark />
        </Link>
        <div className={styles.barRight}>
          <Link href="/login" className={styles.barLink}>
            Log in
          </Link>
          <Link href={makeHref} className={styles.barCta}>
            Make your own
          </Link>
        </div>
      </header>

      <main className={styles.shell}>
        <p className={styles.eyebrow}>Made with Jooma · {KIND[item.kind]}</p>
        <h1 className={styles.title}>{item.title}</h1>
        <p className={styles.by}>
          {item.teacher_name ?? "A Jooma teacher"}
          {meta && <span> · {meta}</span>}
        </p>

        <div className={styles.body}>
          {item.kind === "slides" && item.slides?.length ? (
            <MadeDeck slides={item.slides} />
          ) : sheet ? (
            <SheetDocument doc={sheet} anchors={false} />
          ) : item.output ? (
            <article className={styles.doc}>
              <MarkdownResult text={item.output} />
            </article>
          ) : (
            <p className={styles.by}>
              This resource is not available any more.
            </p>
          )}
        </div>

        <section className={styles.cta}>
          <h2>Make one like this in about a minute</h2>
          <p>
            Type a topic and Jooma builds it, matched to your year group. Try it
            free, no account needed.
          </p>
          <Link href={makeHref} className={styles.ctaBtn}>
            Make your own
          </Link>
        </section>
      </main>
    </div>
  );
}
