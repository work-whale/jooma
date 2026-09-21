import SlideshowList from "./SlideshowList";
import { decodePrefill } from "@/app/lib/toolPrefill";
import type { SlideshowPrefill } from "@/app/components/slideshow/GenerateModal";

/*
 * The Slides tool.
 *
 * A server shell over the client list, for the one reason the other 34 tool
 * pages have one: searchParams are read HERE rather than with useSearchParams()
 * in the component, because that hook forces a client-side bailout needing a
 * Suspense boundary around the whole page. Same approach as cpd-slideshow.
 *
 * ── Why this page takes a prefill at all ──
 * Jo could not reach this tool until now. It is a deck LIST rather than a form,
 * so the animated per-field fill the other tools get has nothing to drive, and
 * the registry skipped it — which left Jo routing every slides request to an
 * older, hidden tool instead. The handover here is simpler than a form's: the
 * decoded values open the generate wizard with step one already filled, and the
 * teacher reviews and continues as usual.
 *
 * Nothing generates on arrival. Same rule as every other prefill: Jo fills the
 * form, the teacher presses the button, so a misread request costs nothing.
 */
export default async function SlideshowPage({
  searchParams,
}: {
  searchParams: Promise<{ prefill?: string }>;
}) {
  const { prefill } = await searchParams;

  // Validated against the registry schema before it reaches the client: the
  // payload arrives in a URL, so it is hostile input. An invalid one decodes to
  // null and the page opens as an ordinary deck list.
  const decoded = decodePrefill(prefill);
  const initial =
    decoded?.slug === "slideshow" ? (decoded.fields as SlideshowPrefill) : null;

  return <SlideshowList prefill={initial} />;
}
