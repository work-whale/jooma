import PageSkeleton from "../PageSkeleton";

// Five KPI tiles above the charts. Without this the whole segment stalls on the
// signup RPCs, which is the longest blocking call on the page.
export default function Loading() {
  return <PageSkeleton stats={4} rows={8} />;
}
