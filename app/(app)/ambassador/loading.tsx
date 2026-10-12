// Route-entry skeleton for /ambassador, which is force-dynamic and waits on two
// RPCs. Shaped like the page: the hero, the share card, four stat tiles and the
// table. The shell comes from app/(app)/layout.tsx and is not remounted.
export default function Loading() {
  const tint = { backgroundColor: "var(--j-tint)" };
  const card = { backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" };
  return (
    <div className="px-4 sm:px-6 lg:px-10 pb-16">
      <div className="max-w-4xl space-y-6 animate-pulse">
        <div className="rounded-3xl border p-6 sm:p-8" style={card}>
          <div className="h-12 w-44 rounded" style={tint} />
          <div className="mt-6 h-7 w-2/3 rounded" style={tint} />
          <div className="mt-3 h-4 w-1/2 rounded" style={tint} />
          <div className="mt-5 h-12 w-72 rounded-2xl" style={tint} />
        </div>
        <div className="h-36 rounded-2xl border" style={card} />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl border" style={card} />
          ))}
        </div>
        <div className="h-64 rounded-2xl border" style={card} />
      </div>
    </div>
  );
}
