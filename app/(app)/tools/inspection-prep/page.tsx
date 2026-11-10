import { Search } from 'lucide-react';
import InspectionPrepForm from '@/app/components/forms/InspectionPrepForm';
import ToolInfoPanel from '@/app/components/ToolInfoPanel';

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function InspectionPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <InspectionPrepForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Search className="w-5 h-5 text-rose-600" />}

          title="Inspection Prep Questions"
          description="Generate self-evaluation questions and preparation actions aligned to your inspection framework. For Ofsted, the guide follows the renewed framework's report card: inclusion, curriculum and teaching, achievement, attendance and behaviour, personal development and wellbeing, leadership and governance, early years and post-16 where relevant, and safeguarding as met or not met."
          steps={[
            {
              label: 'Enter the inspection body',
              detail:
                'Specify the inspectorate or accrediting body — e.g. Ofsted, ISI, CIS, KHDA.',
            },
            {
              label: 'Add a focus area',
              detail:
                'Optionally narrow the output to a specific judgement area such as safeguarding, SEND, or curriculum intent.',
              optional: true,
            },
            {
              label: 'Select additional sections',
              detail:
                'Optionally include evidence examples, success criteria, or recent policy developments.',
              optional: true,
            },
            {
              label: 'Generate',
              detail:
                'Get framework-aligned self-evaluation questions and concrete preparation actions for your senior leadership team.',
            },
          ]}
        />
      }
    />
  );
}
