import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabase } from "@/app/lib/supabase";
import type { SlideJSON } from "@/app/lib/presentations";
import Wordmark from "@/app/components/v2/Wordmark";
import MarkdownResult from "@/app/components/MarkdownResult";
import SheetDocument from "@/app/components/sheets/SheetDocument";
import { printableSheet, readableOutput } from "@/app/lib/printable";
import { isStructuredOutput } from "@/app/lib/toolRunDisplay";
import { isLinkToken } from "@/app/lib/resource-links";
import { v2ToolForSlug } from "@/app/lib/tools";
import MadeDeck from "@/app/made/[slug]/MadeDeck";
import made from "@/app/made/[slug]/made.module.css";
import styles from "./share.module.css";
import SaveCopy from "./SaveCopy";

interface Shared {
  tool_slug: string;
  title: string | null;
  input: Record<string, unknown> | null;
  output: string | null;
  slides: SlideJSON[] | null;
}

/*
 * A resource a teacher shared by link (WhatsApp, Viber, Messenger...).
 *
 * Read through public_resource_link(), as anon: it returns a live link to a
 * classroom resource only, as named columns, with no owner and no teacher
 * name. A turned-off link, a deleted resource, a suspended owner or a tool
 * taken off the allowlist all read as nothing, and so a 404.
 *
 * Not indexed. A link sent to a WhatsApp group is not an invitation to Google;
 * the title and description are there for the chat app's preview card.
 */
const getShared = cache(async (token: string): Promise<Shared | null> => {
  if (!isLinkToken(token)) return null;
  const { data, error } = await supabase.rpc("public_resource_link", { p_token: token });
  if (error) console.warn("[share] could not read:", error.message);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return data[0] as Shared;
});

function kindOf(slug: string): string {
  return v2ToolForSlug(slug)?.name ?? "Resource";
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const item = await getShared(token);
  if (!item) return { title: "Not found", robots: { index: false, follow: false } };
  const title = item.title?.trim() || kindOf(item.tool_slug);
  const description = `${kindOf(item.tool_slug)} shared from Jooma. Open it to view, no sign in needed.`;
  return {
    title: { absolute: `${title} | Made with Jooma` },
    description,
    robots: { index: false, follow: false },
    // Setting openGraph here replaces the layout's whole object, and with it
    // the picture from app/opengraph-image.tsx, so a chat app's preview card
    // would come out blank. The picture is named again for that reason.
    openGraph: {
      title,
      description,
      url: `/share/${token}`,
      type: "article",
      siteName: "Jooma",
      locale: "en_GB",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Jooma" }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const item = await getShared(token);
  if (!item) notFound();

  const slug = item.tool_slug;
  const tool = v2ToolForSlug(slug);
  const title = item.title?.trim() || kindOf(slug);
  const input = item.input ?? {};
  const isDeck = slug === "slideshow";

  // Of a set of differentiated versions, the first; a quiz as its printable
  // version; a designed sheet as its pages; otherwise the text.
  const sheet = isDeck ? null : printableSheet(slug, item.output, input);
  const text = !isDeck && !sheet && item.output && !isStructuredOutput(slug, item.output) ? readableOutput(item.output) : null;

  const meta = [input.subject, input.yearGroup].filter((v): v is string => typeof v === "string" && !!v.trim()).join(" · ");
  const makeHref =
    slug === "slideshow"
      ? `/create?tool=slides&topic=${encodeURIComponent(title)}`
      : slug === "comprehension-generator"
        ? `/create?tool=comp&topic=${encodeURIComponent(title)}`
        : "/signup";

  return (
    <div className={made.page}>
      <header className={made.bar}>
        <Link href="/" className={made.brand} aria-label="Jooma home">
          <Wordmark />
        </Link>
        <div className={made.barRight}>
          <Link href="/login" className={made.barLink}>
            Log in
          </Link>
          <Link href={makeHref} className={made.barCta}>
            Make your own
          </Link>
        </div>
      </header>

      <main className={made.shell}>
        <p className={made.eyebrow}>Shared from Jooma · {kindOf(slug)}</p>
        <h1 className={made.title}>{title}</h1>
        {meta && <p className={made.by}>{meta}</p>}

        <div className={styles.actions}>
          <SaveCopy token={token} toolHref={tool?.href ?? null} />
        </div>

        <div className={made.body}>
          {isDeck && item.slides?.length ? (
            <MadeDeck slides={item.slides} />
          ) : sheet ? (
            <SheetDocument doc={sheet} anchors={false} />
          ) : text ? (
            <article className={made.doc}>
              <MarkdownResult text={text} />
            </article>
          ) : (
            <p className={made.by}>This resource cannot be shown here. Save a copy to open it in Jooma.</p>
          )}
        </div>

        <section className={made.cta}>
          <h2>Make one like this in about a minute</h2>
          <p>Type a topic and Jooma builds it, matched to your year group. Try it free.</p>
          <Link href={makeHref} className={made.ctaBtn}>
            Make your own
          </Link>
        </section>
      </main>
    </div>
  );
}
