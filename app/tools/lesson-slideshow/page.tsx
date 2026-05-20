import { Layers } from "lucide-react";
import LessonSlideshowForm from "@/app/components/forms/LessonSlideshowForm";
import Card from "@/app/components/ui/Card";

export default function LessonSlideshowPage() {
  const sidebar = (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#EFF6FF" }}>
          <Layers className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-900">Lesson Slideshow</h2>
          <p className="text-xs text-gray-500">Classroom presentation</p>
        </div>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">
        Generate a complete lesson presentation for classroom delivery. Each slide covers one key concept — include learning objectives, activities, key facts, and comparisons, all streamed as they're built.
      </p>
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What you get</p>
        <ul className="space-y-1.5 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Title slide with learning objectives
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Key concept content slides
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Pupil activities and discussion prompts
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Side-by-side comparison slides
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Key facts and callout boxes
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500" />
            Export to PDF or PowerPoint
          </li>
        </ul>
      </div>
    </Card>
  );

  return <LessonSlideshowForm sidebar={sidebar} />;
}
