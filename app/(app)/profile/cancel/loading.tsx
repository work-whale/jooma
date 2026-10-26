// Route-entry skeleton for the cancel flow. The page is force-dynamic and reads
// Stripe before it can say anything, so without this the click on "Cancel
// subscription" would show nothing until that returned. Shaped like the reason
// screen, which is where almost everyone arrives. See
// docs/instant-navigation-guide.md §4.
export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-10 pb-16">
      <div className="max-w-2xl animate-pulse">
        <div className="h-3 w-20 rounded mb-4" style={{ backgroundColor: "var(--j-tint)" }} />
        <div className="h-8 w-3/4 rounded-lg mb-3" style={{ backgroundColor: "var(--j-tint)" }} />
        <div className="h-4 w-full rounded mb-6" style={{ backgroundColor: "var(--j-tint)" }} />
        <div className="grid gap-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: "var(--j-tint)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
