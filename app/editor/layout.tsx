import DesktopHintPill from "@/app/components/jo/DesktopHintPill";

// Minimal layout: escapes the SideNav/TopBar in `app/tools/layout.tsx`.
//
// No small screen notice any more. Guests on /create have edited slides on a
// phone with this same Editor for a while, so the signed-in editor opens at
// every width too: phones, tablets and a Fold open or closed. On a phone Jo
// suggests a desktop for the roomier canvas, but nothing is locked away.
export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <DesktopHintPill />
    </>
  );
}
