import { Monitor } from "lucide-react";
import CpdSlideshowForm from "@/app/components/forms/CpdSlideshowForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function CpdSlideshowPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <CpdSlideshowForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Monitor className="w-5 h-5 text-blue-600" />}

          title="Staff Slides"
          description="A staff training (CPD) deck, made in the slide editor. Every slide has a picture and speaker notes, with a discussion task or two, ending on what staff will try next. Choose practical application or research and theory."
          steps={[
            { label: "Enter topic and slide count", detail: "A detailed title will produce more tailored slide content." },
            { label: "Set focus areas", detail: "Steer the content towards specific themes or goals for your session.", optional: true },
            { label: "Generate, then edit and present", detail: "The deck opens in the slide editor: change the theme, edit the notes, ask Jo, present it, or download it for PowerPoint with the notes." },
          ]}
        />
      }
    />
  );
}
