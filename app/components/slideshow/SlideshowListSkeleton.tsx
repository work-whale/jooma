// Shared skeleton for the Slideshows page and any flow that bridges INTO the
// editor (creating a new deck, opening an existing one, generating with AI).
// Renders the exact same chrome the loaded page does — yellow icon, action
// buttons, search bar, count line — so transitions in either direction don't
// shift the layout. Pass `status` to surface what's actually happening below
// the card grid (e.g. "Creating new slideshow…", "Opening slideshow…").

import { Monitor, Search, Plus, Sparkles, Loader2 } from "lucide-react";

interface Props {
  /** Optional one-liner shown beneath the card grid with a spinner. Used by
   *  the /editor/new and /editor/[id] loading screens to tell the user what
   *  they're waiting for. */
  status?: string;
}

export default function SlideshowListSkeleton({ status }: Props) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#FFCC33" }}
          >
            <Monitor className="w-5 h-5" style={{ color: "#1a1a1a" }} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Slideshows</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
          >
            <Sparkles className="w-4 h-4" />
            Generate with AI
          </button>
          <button
            type="button"
            disabled
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl"
            style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
          >
            <Plus className="w-4 h-4" />
            New Slideshow
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search slideshows..."
          disabled
          className="w-full rounded-xl pl-11 pr-4 py-3 text-sm bg-white border focus:outline-none"
          style={{ borderColor: "#DAD8D0" }}
        />
      </div>

      {/* Count line shimmer matches the position of "N slideshows" in the
          loaded view. -mt-4 mirrors the loaded layout's vertical rhythm. */}
      <div className="-mt-4 h-5 w-32 rounded-full animate-pulse" style={{ backgroundColor: "#E7E2D5" }} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-[#FAF9F5] rounded-2xl overflow-hidden border animate-pulse" style={{ borderColor: "#EDEAE0" }}>
            <div className="aspect-video" style={{ backgroundColor: "#ECE8DE" }} />
            <div className="p-4 space-y-2.5">
              <div className="h-4 rounded-full w-3/4" style={{ backgroundColor: "#E7E2D5" }} />
              <div className="h-3 rounded-full w-1/2" style={{ backgroundColor: "#EDE8DC" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Status line beneath the grid — only rendered when the consumer
          knows what work is happening behind the skeleton. Keeps the visual
          identical to the plain list skeleton when no status is supplied. */}
      {status && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{status}</span>
        </div>
      )}
    </div>
  );
}
