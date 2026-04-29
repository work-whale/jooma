import { MdCalendarMonth } from "react-icons/md";
import LessonPlannerForm from "@/app/components/forms/LessonPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function LessonPlannerPage() {
  return (
    <LessonPlannerForm
      sidebar={
        <ToolInfoPanel
            icon={<MdCalendarMonth className="w-5 h-5 text-blue-600" />}
            heroBg="bg-blue-50"
            title="Lesson plan"
            description="Use this tool to design effective lesson plans in minutes. Just add the class level, subject, topic, and what you want students to learn. You can also mention a teaching style or curriculum focus, and the tool will adapt the content to match your classroom goals."
            steps={[
              { label: "Enter key details", detail: "Add the year group, subject, topic, and learning objective." },
              { label: "Set detail level and ability levels", detail: "Choose how comprehensive the plan should be and which ability levels to include." },
              { label: "Add extra guidance", detail: "Optionally include a theme, pedagogical theory, or exam specification.", optional: true },
              { label: "Generate your plan", detail: "The tool creates a complete lesson outline with objectives, activities, resources, and assessments." },
            ]}
          />
      }
    />
  );
}
