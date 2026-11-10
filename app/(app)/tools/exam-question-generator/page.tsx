import { MdSchool } from "react-icons/md";
import ExamQuestionGeneratorForm from "@/app/components/forms/ExamQuestionGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function ExamQuestionGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <ExamQuestionGeneratorForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<MdSchool className="w-5 h-5 text-violet-600" />}

          title="Exam Papers"
          description="A practice paper set out like a GCSE board's, the Year 6 tests or a school test: a cover with the time and total marks, questions in parts with answer space, and a mark scheme on its own pages."
          steps={[
            { label: "Choose the paper style", detail: "A GCSE board's style, the KS2 tests or a school test, and the tier where it applies." },
            { label: "Enter the topic", detail: "Add the topic and any specification points the questions should cover." },
            { label: "Set the paper", detail: "The number of questions, the marks for each and the time allowed. Demand rises through the paper." },
            { label: "Generate", detail: "Edit it on the page or with Jo, download it, or write model answers for it." },
          ]}
        />
      }
    />
  );
}
