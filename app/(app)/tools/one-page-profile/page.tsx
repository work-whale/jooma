import { UserCircle } from "lucide-react";
import OnePageProfileForm from "@/app/components/forms/OnePageProfileForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function OnePageProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <OnePageProfileForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<UserCircle className="w-5 h-5 text-emerald-600" />}

          title="One Page Support Profile"
          description="This tool can be used to create a one page profile for a student. Simply enter notes from your discussion with the pupil and Jooma will turn these into a one page profile for use with student passports or other internal guidance documents."
          steps={[
            { label: "Enter your notes", detail: "Enter your notes in the 3rd person. Jooma will write the profile in the first person for your student." },
            { label: "Be specific", detail: "Describe what the student needs support with, without entering personal details." },
            { label: "Generate", detail: "Get a student-centred, first-person one page profile ready to use or adapt." },
          ]}
        />
      }
    />
  );
}
