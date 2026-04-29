import { Sparkles } from "lucide-react";
import SensoryActivitiesForm from "@/app/components/forms/SensoryActivitiesForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function SensoryActivitiesPage() {
  return (
    <SensoryActivitiesForm
      sidebar={
        <ToolInfoPanel
          icon={<Sparkles className="w-5 h-5 text-emerald-600" />}
          heroBg="bg-emerald-50"
          title="Sensory Activities"
          description="This tool can be used to generate ideas for sensory activities relating to a topic. Simply enter the year group and topic you are teaching, and the AI will generate 5 ideas for you with the resources required and senses targeted."
          steps={[
            { label: "Enter year group and topic", detail: "Use the language as set out in your curriculum." },
            { label: "Generate activities", detail: "Get 5 sensory activity ideas with resources and senses targeted." },
            { label: "Adapt and use", detail: "Use the ideas to support multisensory teaching in your classroom." },
          ]}
        />
      }
    />
  );
}
