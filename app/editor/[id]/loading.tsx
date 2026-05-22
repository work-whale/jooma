// Next.js loading state shown while /editor/[id] mounts. Uses the same
// floating-cards SlideshowLoadingAnimation the editor itself shows while
// waiting on its presentation data, so the transition into the editor is
// one continuous animation — no flash of the slideshow-list skeleton.

import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";

export default function Loading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "#F1EFE3" }}>
      <SlideshowLoadingAnimation label="Opening slideshow" />
    </div>
  );
}
