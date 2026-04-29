import { TextCursorInput } from "lucide-react";
import PhonicsForm from "@/app/components/forms/PhonicsForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function PhonicsSupportPage() {
  return (
    <PhonicsForm
      sidebar={
        <ToolInfoPanel
          icon={<TextCursorInput className="w-5 h-5 text-amber-600" />}
          heroBg="bg-amber-50"
          title="Phonics Support"
          description="This tool can be used to generate words, short decodable stories and learning activities to teach different phonemes."
          steps={[
            { label: "Enter the target phoneme", detail: "It's important to be specific when entering the phoneme you wish to be covered." },
            { label: "Generate resources", detail: "Get word banks, decodable texts, pseudo-words, and teaching activities." },
            { label: "Use in interventions", detail: "Plan phonics interventions for students, or support school staff with activity ideas." },
          ]}
        />
      }
    />
  );
}
