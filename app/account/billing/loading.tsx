// This segment is now just a redirect into /profile?section=subscription, so
// there is no content to skeleton — the real loading state belongs to the
// destination and lives in app/(app)/profile/loading.tsx.
//
// The file stays rather than being deleted because the route is still dynamic
// (it reads searchParams to forward them), and a dynamic segment with no
// loading.tsx cannot be usefully prefetched by <Link>. See
// docs/instant-navigation-guide.md §4. Painting the old three-tab skeleton here
// would flash a page the teacher is about to be moved off.
export default function Loading() {
  return <div className="min-h-dvh" style={{ backgroundColor: "var(--j-tint)" }} />;
}
