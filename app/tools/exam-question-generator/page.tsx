import { MdSchool } from "react-icons/md";
import ExamQuestionGeneratorForm from "@/app/components/forms/ExamQuestionGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function ExamQuestionGeneratorPage() {
  return (
    <ExamQuestionGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<MdSchool className="w-5 h-5 text-violet-600" />}
          heroBg="bg-violet-50"
          title="Exam Question Generator"
          description="Generate a complete examination paper for any subject, topic, and exam type — with questions scaled by marks and an optional mark scheme."
          steps={[
            { label: "Set the context", detail: "Choose curriculum, year group, subject, and exam type." },
            { label: "Enter the topic", detail: "Add the topic and any specific content, knowledge, or skills the questions should cover." },
            { label: "Configure the paper", detail: "Set the number of questions and the mark range — questions will escalate in demand from min to max marks." },
            { label: "Generate", detail: "The tool produces a full examination paper with a student information section, instructions, and an optional mark scheme." },
          ]}
        />
      }
    />
  );
}
