import AssemblySlidesStart from "@/app/components/staff-slides/AssemblySlidesStart";

// "Make assembly slides" on an assembly script lands here with ?from=<runId>.
// searchParams are read on the server, as the tool pages do, so the client
// needs no Suspense boundary.
export default async function AssemblySlidesPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return <AssemblySlidesStart from={from ?? null} />;
}
