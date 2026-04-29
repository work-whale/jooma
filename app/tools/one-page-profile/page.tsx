import { UserCircle } from "lucide-react";
import OnePageProfileForm from "@/app/components/forms/OnePageProfileForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function OnePageProfilePage() {
  return (
    <OnePageProfileForm
      sidebar={
        <ToolInfoPanel
          icon={<UserCircle className="w-5 h-5 text-emerald-600" />}
          heroBg="bg-emerald-50"
          title="One Page Support Profile"
          description="This tool can be used to create a one page profile for a student. Simply enter notes from your discussion with the pupil and the AI will turn these into a one page profile for use with student passports or other internal guidance documents."
          steps={[
            { label: "Enter your notes", detail: "Enter your notes in the 3rd person — the AI will write the profile in the first person for your student." },
            { label: "Be specific", detail: "Describe what the student needs support with, without entering personal details." },
            { label: "Generate", detail: "Get a student-centred, first-person one page profile ready to use or adapt." },
          ]}
        />
      }
    />
  );
}
