import { ListChecks } from "lucide-react";
import TopicOverviewForm from "@/app/components/forms/TopicOverviewForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function TopicOverviewPage() {
  return (
    <TopicOverviewForm
      sidebar={
        <ToolInfoPanel
          icon={<ListChecks className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="Topic Overview"
          description="This tool can be used to generate a topic overview. Simply provide the year group, subject and topic and the AI will generate a structured overview with lesson summaries."
          steps={[
            { label: "Be specific with the topic", detail: "Use the language from your curriculum documentation." },
            { label: "Set lesson count", detail: "Set the number of lessons to match your actual scheme of work." },
            { label: "Generate and share", detail: "Plan a new unit, or share the overview with students or parents." },
          ]}
        />
      }
    />
  );
}
