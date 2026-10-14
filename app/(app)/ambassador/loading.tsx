// Route-entry skeleton for the ambassador tabs, which are force-dynamic and wait
// on definer RPCs. Shaped like a tab: four metric tiles and two panels. The
// gold band above comes from the persistent layout and is not re-rendered.
export default function Loading() {
  const card = { backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" };
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border" style={card} />
        ))}
      </div>
      <div className="h-56 rounded-2xl border" style={card} />
      <div className="h-64 rounded-2xl border" style={card} />
    </div>
  );
}
