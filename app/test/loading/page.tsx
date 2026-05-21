// Standalone preview page for SlideshowLoadingAnimation. Lets us iterate on
// the floating-cards animation without having to navigate into the editor
// each time. Not linked from the app — visit /test/loading directly.

import SlideshowLoadingAnimation from "@/app/components/editor/SlideshowLoadingAnimation";

export default function LoadingAnimationTestPage() {
  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "#F1EFE3" }}>
      <SlideshowLoadingAnimation label="Loading slideshow" />
    </div>
  );
}
