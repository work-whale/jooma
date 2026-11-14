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
          description="A preparation guide laid out area by area. For Ofsted it follows the renewed framework's report card: inclusion, curriculum and teaching, achievement, attendance and behaviour, personal development and wellbeing, leadership and governance, early years and post-16 where you have them, and safeguarding as met or not met. Each area ends with a blank row for leaders to tick where they are now: the guide never grades you."
          steps={[
            {
              label: 'Pick the inspection body',
              detail:
                'Ofsted, ISI, SIAMS, Estyn, Education Scotland or ETI, or type another (for example CIS or KHDA).',
            },
            {
              label: 'Add a focus area',
              detail:
                'Optionally give extra weight to an area such as safeguarding, SEND or early reading.',
              optional: true,
            },
            {
              label: 'Choose the extras',
              detail:
                'For Ofsted, tick early years or a sixth form if you have them. Optionally add the evidence you already keep and success criteria.',
              optional: true,
            },
            {
              label: 'Generate, then refine with Jo',
              detail:
                'Get questions, a prep action table with leads and dates per area, and a self-check row. Ask Jo to change anything, then print or download it.',
            },
          ]}
        />
      }
    />
  );
}
