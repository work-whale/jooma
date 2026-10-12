// Route-entry skeleton for /pricing. The page is force-dynamic and reads
// Stripe, so without this the segment shows nothing while that resolves. See
// docs/instant-navigation-guide.md section 4.
//
// The sidebar and top bar come from app/(app)/layout.tsx and are not remounted,
// so this renders only the page body: the intro line, the billing toggle and
// three plan cards.
export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-10 pb-16">
      <div className="max-w-3xl animate-pulse">
        <div className="h-4 w-2/3 rounded mb-6" style={{ backgroundColor: "var(--j-tint)" }} />
        <div className="h-4 w-32 rounded mb-4" style={{ backgroundColor: "var(--j-tint)" }} />
        <div
          className="h-10 w-56 mx-auto rounded-full mb-5"
          style={{ backgroundColor: "var(--j-tint)" }}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-80 rounded-2xl border"
              style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
