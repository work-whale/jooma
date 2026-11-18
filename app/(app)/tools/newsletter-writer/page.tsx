import { Newspaper } from "lucide-react";
import NewsletterWriterForm from "@/app/components/forms/NewsletterWriterForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function NewsletterWriterPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <NewsletterWriterForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Newspaper className="w-5 h-5 text-rose-600" />}

          title="Newsletter Writer"
          description="This tool will allow you to write a newsletter with the tone of your choice, including multiple different sections."
          steps={[
            { label: "Enter your sections", detail: "Be specific with the content you'd like in each section for the best output." },
            { label: "Choose your tone", detail: "Select the tone that suits your audience: parents, staff, or the whole community." },
            { label: "Generate", detail: "Get a complete newsletter for your whole school or department." },
          ]}
        />
      }
    />
  );
}
