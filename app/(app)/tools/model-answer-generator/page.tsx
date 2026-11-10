import { ClipboardCheck } from "lucide-react";
import ModelAnswerForm from "@/app/components/forms/ModelAnswerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function ModelAnswerGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string; from?: string }>;
}) {
  const { from, ...launch } = await searchParams;
  return (
    <ModelAnswerForm
      launch={launch}
      from={from}
      sidebar={
        <ToolInfoPanel
          icon={<ClipboardCheck className="w-5 h-5 text-violet-600" />}

          title="Model Answers"
          description="Model answers to exam questions at full marks, a middle mark and a near miss, each annotated with where the marks come from. Add up to eight questions, or open it from an exam paper."
          steps={[
            { label: "Add the questions", detail: "Type them in with their marks, or press Write model answers on an exam paper." },
            { label: "Choose the answers", detail: "Full marks, a middle answer and a near miss, or any of them." },
            { label: "Add the mark scheme", detail: "Paste the mark scheme or marking guidance if you have it.", optional: true },
            { label: "Generate", detail: "Annotated answers you can print, edit or ask Jo to change." },
          ]}
        />
      }
    />
  );
}
