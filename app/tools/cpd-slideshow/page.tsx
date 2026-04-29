import { Monitor } from "lucide-react";
import CpdSlideshowForm from "@/app/components/forms/CpdSlideshowForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function CpdSlideshowPage() {
  return (
    <CpdSlideshowForm
      sidebar={
        <ToolInfoPanel
          icon={<Monitor className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="CPD Slideshow Generator"
          description="This tool will create presentations for teacher professional development sessions. Simply enter the topic and number of slides and let the AI draft the content. You can also select whether the slides focus on practical application or research and theory."
          steps={[
            { label: "Enter topic and slide count", detail: "A detailed title will produce more tailored slide content." },
            { label: "Set focus areas", detail: "Steer the content towards specific themes or goals for your session.", optional: true },
            { label: "Generate", detail: "Create training resources for staff CPD sessions focusing on practical application or theory." },
          ]}
        />
      }
    />
  );
}
