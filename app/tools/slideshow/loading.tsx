// Next.js's auto-rendered suspense loading state for /tools/slideshow.
// Renders the shared list skeleton with no status text — this is just the
// initial cards-loading shimmer, no other flow waiting behind it.

import SlideshowListSkeleton from "@/app/components/slideshow/SlideshowListSkeleton";

export default function Loading() {
  return <SlideshowListSkeleton />;
}
