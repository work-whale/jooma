"use client";

import { useEffect, useRef, useState } from "react";
import { Shapes, Type, Image as ImageIcon, Square, Circle, Triangle as TriangleIcon, Minus, X, MoveRight, Star, Hexagon, Sparkles, Loader2, Search, Heart, Cloud, MessageCircle, Plus as PlusIcon, Zap, Pentagon, Octagon, Diamond, Headphones, Film, ListChecks, Volume2, MessagesSquare, HelpCircle, CheckSquare, FormInput, Tags, Images, Brain, ToggleLeft, ToggleRight, ArrowUpDown, Palette, ImagePlay } from "lucide-react";
import { parseYouTubeId } from "./youtube";
import GraphicsPanel from "./GraphicsPanel";
import PicturesPanel from "./PicturesPanel";
import FramePicker from "./FramePicker";
import type { FrameShape } from "./frames";
import { GOOGLE_FONTS, injectGoogleFonts } from "./googleFonts";
import { listGeneratedImages, saveGeneratedImage, thumbUrl, type GeneratedImage } from "@/app/lib/generatedImages";

type TabId = "elements" | "text" | "activities" | "pictures" | "gif" | "audio" | "video";

// Sub-tabs inside the consolidated "Pictures" tab.
type PictureSubTab = "stock" | "upload" | "ai";
const PICTURE_SUB_TAB_LABELS: Record<PictureSubTab, string> = {
  stock: "Images",
  upload: "Upload",
  ai: "AI generate",
};

type VideoSubTab = "ai" | "youtube" | "upload";
const VIDEO_SUB_TAB_LABELS: Record<VideoSubTab, string> = {
  ai: "Suggest with AI",
  youtube: "YouTube",
  upload: "Upload",
};

// Activity catalogue — the 12 kinds the picker offers. Each runs its own AI
// generation when added: the teacher picks a kind, optionally types a topic
// and a difficulty level, and the API returns slide content to insert.
export type ActivityKind =
  | "listen-answer" | "open-ended" | "quiz" | "which-true"
  | "fill-blanks" | "vocab-match" | "image-match" | "discussion"
  | "true-false" | "true-false-why" | "order" | "creative";

export type ActivityLevel = "Easy" | "Moderate" | "Difficult";

/** Config the teacher fills before generation. `topic` is optional — the API
 *  falls back to the deck's lesson when blank. */
export interface ActivityConfig {
  topic?: string;
  level: ActivityLevel;
}

const ACTIVITIES: { kind: ActivityKind; label: string; description: string; icon: React.ReactNode }[] = [
  { kind: "listen-answer",   label: "Listen and answer",        description: "Audio clip with related activities",      icon: <Volume2 className="w-5 h-5" /> },
  { kind: "open-ended",      label: "Open-ended",               description: "We'll dream up something new and fun",    icon: <Cloud className="w-5 h-5" /> },
  { kind: "quiz",            label: "Quiz",                     description: "3 questions and answers based on your lesson", icon: <HelpCircle className="w-5 h-5" /> },
  { kind: "which-true",      label: "Which are true?",          description: "Questions with multiple answer options",  icon: <CheckSquare className="w-5 h-5" /> },
  { kind: "fill-blanks",     label: "Fill in the blanks",       description: "Match the words to the gaps in a sentence", icon: <FormInput className="w-5 h-5" /> },
  { kind: "vocab-match",     label: "Vocab matching",           description: "Match the words to the definitions",      icon: <Tags className="w-5 h-5" /> },
  { kind: "image-match",     label: "Image matching",           description: "Match the words to the images",           icon: <Images className="w-5 h-5" /> },
  { kind: "discussion",      label: "Discussion prompt",        description: "Ideas for thought-provoking discussions", icon: <MessagesSquare className="w-5 h-5" /> },
  { kind: "true-false",      label: "True or false",            description: "A true or false question",                icon: <ToggleLeft className="w-5 h-5" /> },
  { kind: "true-false-why",  label: "True or false and why",    description: "A true or false question with explanations", icon: <ToggleRight className="w-5 h-5" /> },
  { kind: "order",           label: "What's the right order",   description: "Put items in the correct sequence",       icon: <ArrowUpDown className="w-5 h-5" /> },
  { kind: "creative",        label: "Creative",                 description: "Unleash your creativity with open-ended questions", icon: <Palette className="w-5 h-5" /> },
];

export interface SidebarAudioActivity {
  src: string;
  title: string;
  description: string;
  transcript?: string;
  questions: string[];
}

type AudioActivityType = "comprehension" | "true-false" | "gap-fills";

const AUDIO_ACTIVITY_TYPES: { id: AudioActivityType; label: string }[] = [
  { id: "comprehension", label: "Comprehension" },
  { id: "true-false", label: "True/False" },
  { id: "gap-fills", label: "Gap fills" },
];

type SidebarShape =
  | "rect" | "ellipse" | "triangle" | "line" | "arrow" | "star" | "hexagon"
  | "pentagon" | "octagon" | "diamond" | "heart" | "cloud" | "speech" | "plus" | "bolt";

interface Props {
  onAddShape: (type: SidebarShape) => void;
  onAddText: (preset: "heading" | "subheading" | "body", fontFamily?: string) => void;
  onAddImage: (dataUrl: string) => void;
  onAddFrame?: (frame: FrameShape) => void;
  onAddAudioActivity?: (audio: SidebarAudioActivity) => void;
  onAddVideo?: (source: "youtube" | "upload", src: string, title?: string) => void;
  /** Add an AI-generated activity slide of the chosen kind. Returns a
   *  Promise so the form can show a busy state and stay open until done. */
  onAddActivity?: (kind: ActivityKind, config: ActivityConfig) => Promise<void> | void;
  // Bumped by the Editor whenever it saves a new image to the gallery (e.g. from
  // the SSE wizard stream or right-click regenerate). Triggers a refetch here.
  galleryRefreshTrigger?: number;
  /** Imperative open request from the Editor (e.g. the canvas "Swap image"
   *  button opening the Pictures tab). The `nonce` makes repeated requests to
   *  the same tab re-fire. `subTab` optionally selects a Pictures sub-tab. */
  openSignal?: { tab: TabId; subTab?: PictureSubTab; nonce: number };
}

const AI_STYLES: { id: "photographic" | "illustration" | "storybook" | "painted" | "line-drawing" | "comic-book"; label: string }[] = [
  { id: "photographic", label: "Photo" },
  { id: "illustration", label: "Illustration" },
  { id: "storybook", label: "Storybook" },
  { id: "painted", label: "Painted" },
  { id: "line-drawing", label: "Line" },
  { id: "comic-book", label: "Comic" },
];

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "elements", label: "Elements", icon: <Shapes className="w-5 h-5" /> },
  { id: "text", label: "Text", icon: <Type className="w-5 h-5" /> },
  { id: "activities", label: "Activities", icon: <ListChecks className="w-5 h-5" /> },
  { id: "pictures", label: "Pictures", icon: <ImageIcon className="w-5 h-5" /> },
  { id: "gif", label: "GIFs", icon: <ImagePlay className="w-5 h-5" /> },
  { id: "audio", label: "Audio", icon: <Headphones className="w-5 h-5" /> },
  { id: "video", label: "Video", icon: <Film className="w-5 h-5" /> },
];

type ElementSubTab = "shapes" | "graphics" | "frames";

const SUB_TAB_LABELS: Record<ElementSubTab, string> = {
  shapes: "Shapes",
  graphics: "Graphics",
  frames: "Frames",
};

export default function Sidebar({
  onAddShape,
  onAddText,
  onAddImage,
  onAddFrame,
  onAddAudioActivity,
  onAddVideo,
  onAddActivity,
  galleryRefreshTrigger = 0,
  openSignal,
}: Props) {
  // ── Video tab ─────────────────────────────────────────────────────────────
  const videoFileRef = useRef<HTMLInputElement>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState<string | null>(null);
  const [videoSuggestTopic, setVideoSuggestTopic] = useState("");
  const [videoSuggestBusy, setVideoSuggestBusy] = useState(false);
  const [videoSuggestError, setVideoSuggestError] = useState<string | null>(null);

  const handleAddYouTube = () => {
    const id = parseYouTubeId(videoUrl);
    if (!id) {
      setVideoUrlError("Couldn't find a YouTube video id in that URL");
      return;
    }
    setVideoUrlError(null);
    onAddVideo?.("youtube", id);
    setVideoUrl("");
  };

  const handleSuggestVideo = async () => {
    const topic = videoSuggestTopic.trim();
    if (!topic) {
      setVideoSuggestError("Tell us what the video should be about");
      return;
    }
    setVideoSuggestBusy(true);
    setVideoSuggestError(null);
    try {
      const r = await fetch("/api/find-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, length: "any" }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Couldn't find a video");
      }
      const data: { videoId: string; title: string } = await r.json();
      onAddVideo?.("youtube", data.videoId, data.title);
      setVideoSuggestTopic("");
    } catch (err) {
      setVideoSuggestError(err instanceof Error ? err.message : "Couldn't find a video");
    } finally {
      setVideoSuggestBusy(false);
    }
  };

  const handleVideoFile = async (file: File) => {
    setVideoUploading(true);
    setVideoUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload-video", { method: "POST", body: fd });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Upload failed");
      }
      const data: { src: string } = await r.json();
      onAddVideo?.("upload", data.src, file.name);
    } catch (err) {
      setVideoUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setVideoUploading(false);
    }
  };
  // Audio tab state
  const [audioTopic, setAudioTopic] = useState("");
  const [audioScript, setAudioScript] = useState("");
  const [audioActivityType, setAudioActivityType] = useState<AudioActivityType>("comprehension");
  const [audioInstructions, setAudioInstructions] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const handleAudioGenerate = async () => {
    const hasTopic = audioTopic.trim().length > 0;
    const hasScript = audioScript.trim().length > 0;
    if (!hasTopic && !hasScript) return;
    if (audioBusy) return;
    setAudioBusy(true);
    setAudioError(null);
    try {
      const r = await fetch("/api/generate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: audioTopic.trim() || "Custom script",
          activityType: audioActivityType,
          additionalInstructions: audioInstructions.trim() || undefined,
          scriptOverride: hasScript ? audioScript.trim() : undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Generation failed");
      }
      const data = await r.json();
      onAddAudioActivity?.({
        src: data.src,
        title: data.title,
        description: data.description,
        transcript: data.transcript,
        questions: data.questions ?? [],
      });
      setAudioTopic("");
      setAudioScript("");
      setAudioInstructions("");
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAudioBusy(false);
    }
  };
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState<typeof AI_STYLES[number]["id"]>("photographic");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GeneratedImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [gallerySearch, setGallerySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce the search input so we don't hammer Supabase on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(gallerySearch.trim()), 250);
    return () => clearTimeout(t);
  }, [gallerySearch]);

  // Gallery fetch is moved below the `active` state declaration so we can
  // gate it on the AI tab being open. See the useEffect after `setActive`.

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt.trim(), style: aiStyle }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }
      const data: { dataUrl: string } = await r.json();
      const saved = await saveGeneratedImage({ prompt: aiPrompt.trim(), style: aiStyle, dataUrl: data.dataUrl, source: "editor-ai" });
      setGallery((prev) => [saved, ...prev]);
      setAiPrompt("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setAiBusy(false);
    }
  };
  // Click-toggle only. The panel stays open until the user clicks the same icon,
  // the close button, or anywhere outside the sidebar.
  const [active, setActive] = useState<TabId | null>(null);
  // Which sub-tab of the consolidated Pictures tab is showing.
  const [pictureSubTab, setPictureSubTab] = useState<PictureSubTab>("stock");
  const [videoSubTab, setVideoSubTab] = useState<VideoSubTab>("ai");

  // Activities tab — drill-in state. null = catalogue grid; otherwise the
  // selected kind's config form is shown (topic + level + Add button).
  const [activityPickedKind, setActivityPickedKind] = useState<ActivityKind | null>(null);
  const [activityTopic, setActivityTopic] = useState("");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("Moderate");
  const [activityBusy, setActivityBusy] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const handleAddActivityClick = async () => {
    if (!activityPickedKind || !onAddActivity) return;
    setActivityBusy(true);
    setActivityError(null);
    try {
      await onAddActivity(activityPickedKind, {
        topic: activityTopic.trim() || undefined,
        level: activityLevel,
      });
      // Reset form and return to the catalogue on success.
      setActivityPickedKind(null);
      setActivityTopic("");
      setActivityLevel("Moderate");
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : "Couldn't generate activity");
    } finally {
      setActivityBusy(false);
    }
  };

  // Respond to imperative open requests from the Editor (canvas "Swap image").
  // Watching the nonce means the same tab can be re-opened repeatedly.
  useEffect(() => {
    if (!openSignal) return;
    setActive(openSignal.tab);
    if (openSignal.subTab) setPictureSubTab(openSignal.subTab);
  }, [openSignal?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gallery fetch — gated on the AI tab being open. The gallery rows hold
  // full base64 image data (~2.7 MB each), so loading on every editor mount
  // was crushing free-tier Postgres compute (saturated CPU + timeouts on
  // unrelated queries). Now the fetch only fires when the user actually
  // opens the AI tab. Limit dropped from 100 → 30 to keep worst-case at
  // ~80 MB instead of ~270 MB per request.
  useEffect(() => {
    // Only fetch when the Pictures tab's AI sub-tab is showing — the gallery
    // rows hold full base64 data, so we keep this lazy.
    if (active !== "pictures" || pictureSubTab !== "ai") return;
    let cancelled = false;
    setGalleryLoading(true);
    listGeneratedImages({ search: debouncedSearch, limit: 30 })
      .then((rows) => { if (!cancelled) setGallery(rows); })
      .catch((err) => { if (!cancelled) console.warn("Gallery fetch failed:", err); })
      .finally(() => { if (!cancelled) setGalleryLoading(false); });
    return () => { cancelled = true; };
  }, [active, pictureSubTab, debouncedSearch, galleryRefreshTrigger]);

  // Lazy-inject the Google Fonts <link> the first time the sidebar mounts.
  useEffect(() => { injectGoogleFonts(); }, []);
  const [elementSubTab, setElementSubTab] = useState<ElementSubTab>("shapes");
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<string[]>([]);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadUrlBusy, setUploadUrlBusy] = useState(false);
  const [uploadUrlError, setUploadUrlError] = useState<string | null>(null);

  const handleAddByUrl = async () => {
    const u = uploadUrl.trim();
    if (!u || uploadUrlBusy) return;
    setUploadUrlBusy(true);
    setUploadUrlError(null);
    try {
      const r = await fetch("/api/fetch-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch image");
      }
      const data: { dataUrl: string } = await r.json();
      setUploads((prev) => [data.dataUrl, ...prev]);
      onAddImage(data.dataUrl);
      setUploadUrl("");
    } catch (err) {
      setUploadUrlError(err instanceof Error ? err.message : "Failed");
    } finally {
      setUploadUrlBusy(false);
    }
  };
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Track which sub-tabs have ever been opened. Graphics + Pictures keep their
  // own search/scroll state, so once the user opens them we KEEP them mounted
  // and only hide them via display:none. Re-opening the sidebar then preserves
  // whatever the user had typed/scrolled.
  const [openedSubTabs, setOpenedSubTabs] = useState<Set<ElementSubTab>>(() => new Set(["shapes"]));
  useEffect(() => {
    if (active === "elements") {
      setOpenedSubTabs((prev) => prev.has(elementSubTab) ? prev : new Set(prev).add(elementSubTab));
    }
  }, [active, elementSubTab]);

  // Close when clicking outside the sidebar
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setActive(null);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [active]);

  const handleClick = (id: TabId) => {
    setActive((prev) => (prev === id ? null : id));
  };

  const handleClose = () => setActive(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        setUploads((prev) => [dataUrl, ...prev]);
        onAddImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      ref={sidebarRef}
      className="flex shrink-0 relative z-20 [&_button]:cursor-pointer [&_a]:cursor-pointer [&_label]:cursor-pointer"
      style={{ backgroundColor: "#F1EFE3" }}
    >
      {/* Vertical icon strip */}
      <div
        className="flex flex-col items-center py-3 gap-1 border-r"
        style={{ borderColor: "#DAD8D0", width: 72, backgroundColor: "#F1EFE3" }}
      >
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleClick(t.id)}
              className={`w-14 flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-gray-600 hover:bg-violet-100 hover:text-violet-700"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Expanded panel — kept in the DOM once mounted, hidden via display:none
          when no tab is active so stateful sub-panels (Graphics search, Pictures
          search/scroll) survive close-and-reopen. */}
      <div
        className="absolute top-0 bottom-0 w-72 border-r shadow-lg flex flex-col"
        style={{
          borderColor: "#DAD8D0",
          backgroundColor: "#F1EFE3",
          left: 72,
          display: active ? "flex" : "none",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "#DAD8D0" }}>
          <h3 className="text-sm font-semibold text-gray-800 capitalize">{active ?? ""}</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            title="Close"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

          <div className="flex-1 overflow-y-auto p-4">
            {active === "elements" && (
              <div className="space-y-3">
                {/* Sub-tabs (horizontally scrollable) */}
                <div
                  className="flex gap-1 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {(["shapes", "graphics", "frames"] as ElementSubTab[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => setElementSubTab(id)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        elementSubTab === id
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {SUB_TAB_LABELS[id]}
                    </button>
                  ))}
                </div>

                {elementSubTab === "shapes" && (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => onAddShape("rect")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Rectangle"
                    >
                      <Square className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("ellipse")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Ellipse"
                    >
                      <Circle className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("triangle")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Triangle"
                    >
                      <TriangleIcon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("hexagon")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Hexagon"
                    >
                      <Hexagon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("star")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Star"
                    >
                      <Star className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("line")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Line"
                    >
                      <Minus className="w-7 h-7 text-gray-700" strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => onAddShape("arrow")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Arrow"
                    >
                      <MoveRight className="w-7 h-7 text-gray-700" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => onAddShape("pentagon")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Pentagon"
                    >
                      <Pentagon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("octagon")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Octagon"
                    >
                      <Octagon className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("diamond")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Diamond"
                    >
                      <Diamond className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("heart")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Heart"
                    >
                      <Heart className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("cloud")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Cloud"
                    >
                      <Cloud className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("speech")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Speech bubble"
                    >
                      <MessageCircle className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={() => onAddShape("plus")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Plus"
                    >
                      <PlusIcon className="w-7 h-7 text-gray-700" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => onAddShape("bolt")}
                      className="aspect-square flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Lightning bolt"
                    >
                      <Zap className="w-7 h-7 text-gray-700" strokeWidth={1.5} />
                    </button>
                  </div>
                )}

                {/* Keep Graphics + Pictures mounted once first opened so their
                    search query, results, and scroll position survive across
                    close/reopen and sub-tab switches. */}
                {openedSubTabs.has("graphics") && (
                  <div style={{ display: elementSubTab === "graphics" ? "block" : "none" }}>
                    <GraphicsPanel onAdd={onAddImage} />
                  </div>
                )}

                {elementSubTab === "frames" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-gray-500">
                      Click a frame to drop it on the slide. Then drag any photo from the Pictures tab onto it.
                    </p>
                    <FramePicker
                      onSelect={(f) => onAddFrame?.(f)}
                      columns={3}
                      showLabels
                    />
                  </div>
                )}

              </div>
            )}

            {active === "pictures" && (
              <div className="space-y-3">
                {/* Sub-tabs: Stock search / Upload / AI generate */}
                <div
                  className="flex gap-1 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {(["stock", "upload", "ai"] as PictureSubTab[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => setPictureSubTab(id)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        pictureSubTab === id
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {PICTURE_SUB_TAB_LABELS[id]}
                    </button>
                  ))}
                </div>

                {/* Stock search — kept mounted so its query/scroll survive. */}
                <div style={{ display: pictureSubTab === "stock" ? "block" : "none" }}>
                  <PicturesPanel onAdd={onAddImage} />
                </div>

                {/* Upload from device or URL */}
                {pictureSubTab === "upload" && (
                  <div className="space-y-3">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2 rounded-xl transition-colors"
                    >
                      Upload image
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                        e.target.value = "";
                      }}
                    />
                    <div className="pt-2 border-t" style={{ borderColor: "#DAD8D0" }}>
                      <p className="text-[11px] font-semibold text-gray-700 mb-1">Add by URL</p>
                      <div className="flex gap-1.5">
                        <input
                          type="url"
                          value={uploadUrl}
                          onChange={(e) => setUploadUrl(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddByUrl(); } }}
                          placeholder="https://..."
                          disabled={uploadUrlBusy}
                          className="flex-1 min-w-0 px-2 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                          style={{ borderColor: "#DAD8D0" }}
                        />
                        <button
                          onClick={handleAddByUrl}
                          disabled={uploadUrlBusy || !uploadUrl.trim()}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
                          style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
                        >
                          {uploadUrlBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
                        </button>
                      </div>
                      {uploadUrlError && <p className="text-[10px] text-red-600 mt-1">{uploadUrlError}</p>}
                    </div>
                    {uploads.length > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {uploads.map((u, i) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={u}
                            alt=""
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("application/x-jooma-image", u)}
                            onClick={() => onAddImage(u)}
                            className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 border border-gray-200"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* AI photo generation */}
                {pictureSubTab === "ai" && (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500">
                  Describe an image and AI will generate it. Results join the gallery below.
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiGenerate();
                    }
                  }}
                  placeholder="A photo of saturn with its rings"
                  rows={2}
                  disabled={aiBusy}
                  className="w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
                  style={{ borderColor: "#DAD8D0" }}
                />
                <div className="flex flex-wrap gap-1">
                  {AI_STYLES.map((s) => {
                    const selected = aiStyle === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAiStyle(s.id)}
                        disabled={aiBusy}
                        className="px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-colors"
                        style={
                          selected
                            ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                            : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                        }
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={aiBusy || !aiPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
                >
                  {aiBusy ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate
                    </>
                  )}
                </button>
                {aiError && (
                  <p className="text-[10px] text-red-600">{aiError}</p>
                )}
                <div className="pt-2 border-t" style={{ borderColor: "#DAD8D0" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Gallery</p>
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                    <input
                      type="text"
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      placeholder="Search across all slideshows"
                      className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                      style={{ borderColor: "#DAD8D0" }}
                    />
                  </div>
                  {galleryLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    </div>
                  ) : gallery.length === 0 ? (
                    <p className="text-[11px] text-gray-400">
                      {debouncedSearch ? "No images match that search." : "Generated images from all your slideshows will appear here."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {gallery.map((g) => (
                        <div key={g.id} className="min-w-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbUrl(g.data_url, 240)}
                            onError={(e) => { const t = e.currentTarget; if (t.src !== g.data_url) t.src = g.data_url; }}
                            alt={g.title ?? g.prompt}
                            title={g.description ?? g.title ?? g.prompt}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("application/x-jooma-image", g.data_url)}
                            onClick={() => onAddImage(g.data_url)}
                            className="w-full aspect-square object-cover rounded-lg cursor-pointer hover:opacity-80 border border-gray-200"
                          />
                          <p
                            className="mt-1 text-[10px] leading-tight text-gray-500 truncate"
                            title={g.description ?? g.title ?? g.prompt}
                          >
                            {g.title ?? g.prompt}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
                )}
              </div>
            )}

            {active === "gif" && (
              <div className="space-y-3">
                <PicturesPanel onAdd={onAddImage} onlyProvider="giphy" />
              </div>
            )}

            {active === "activities" && activityPickedKind === null && (
              // Catalogue view: 12 activity cards. Click one to open its
              // config form below.
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500">
                  Pick an activity. We&apos;ll ask for a topic and difficulty, then generate a slide.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITIES.map((a) => (
                    <button
                      key={a.kind}
                      type="button"
                      onClick={() => {
                        setActivityPickedKind(a.kind);
                        setActivityError(null);
                      }}
                      className="text-left rounded-xl border bg-white p-3 hover:border-violet-400 hover:shadow-sm transition-all flex flex-col gap-1.5"
                      style={{ borderColor: "#DAD8D0" }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-700">
                        {a.icon}
                      </div>
                      <p className="text-xs font-semibold text-gray-900 leading-tight">{a.label}</p>
                      <p className="text-[10px] text-gray-500 leading-snug">{a.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {active === "activities" && activityPickedKind !== null && (() => {
              const picked = ACTIVITIES.find((x) => x.kind === activityPickedKind)!;
              const LEVELS: ActivityLevel[] = ["Easy", "Moderate", "Difficult"];
              return (
                <div className="space-y-3.5">
                  {/* Back button + heading */}
                  <button
                    type="button"
                    onClick={() => { setActivityPickedKind(null); setActivityError(null); }}
                    disabled={activityBusy}
                    className="text-xs font-semibold border rounded-full px-3 py-1 transition-colors disabled:opacity-50"
                    style={{ borderColor: "#2e7d52", color: "#2e7d52" }}
                  >
                    Back
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-700">
                      {picked.icon}
                    </div>
                    <p className="text-sm font-bold text-gray-900">{picked.label}</p>
                  </div>

                  {/* Topic input */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-800 mb-1">Specific topic (optional)</label>
                    <input
                      type="text"
                      value={activityTopic}
                      onChange={(e) => setActivityTopic(e.target.value)}
                      placeholder="General lesson content if left blank…"
                      disabled={activityBusy}
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      className="w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                      style={{ borderColor: "#DAD8D0" }}
                    />
                  </div>

                  {/* Level picker */}
                  <div>
                    <p className="text-xs font-semibold text-gray-800 mb-1">Level</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {LEVELS.map((l) => {
                        const selected = activityLevel === l;
                        return (
                          <button
                            key={l}
                            type="button"
                            onClick={() => setActivityLevel(l)}
                            disabled={activityBusy}
                            className="text-xs font-semibold py-2 rounded-lg border transition-colors disabled:opacity-60"
                            style={
                              selected
                                ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                                : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                            }
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add activity button */}
                  <button
                    type="button"
                    onClick={handleAddActivityClick}
                    disabled={activityBusy}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60"
                    style={{ backgroundColor: "#2e7d52", color: "#fff" }}
                  >
                    {activityBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Add activity
                      </>
                    )}
                  </button>
                  {activityError && <p className="text-[11px] text-red-600">{activityError}</p>}
                </div>
              );
            })()}

            {active === "audio" && (
              <div className="space-y-3">
                <p className="text-[11px] text-gray-500">
                  Generate a listening activity — a TTS clip plus comprehension questions — and drop it onto a new slide.
                </p>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-700">
                    Topic <span className="text-gray-400 font-normal">{audioScript.trim() ? "(used for AI questions)" : ""}</span>
                  </span>
                  <input
                    type="text"
                    value={audioTopic}
                    onChange={(e) => setAudioTopic(e.target.value)}
                    placeholder="E.g. The water cycle"
                    disabled={audioBusy}
                    className="mt-1 w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                    style={{ borderColor: "#DAD8D0" }}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-700">
                    Script <span className="text-gray-400 font-normal">(optional)</span>
                  </span>
                  <textarea
                    value={audioScript}
                    onChange={(e) => setAudioScript(e.target.value)}
                    placeholder="Paste your own script here — it'll be read aloud exactly. Leave blank and AI will write one."
                    rows={4}
                    disabled={audioBusy}
                    className="mt-1 w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
                    style={{ borderColor: "#DAD8D0" }}
                  />
                </label>
                <div>
                  <span className="text-[11px] font-semibold text-gray-700 block mb-1">Activity type</span>
                  <div className="flex flex-wrap gap-1">
                    {AUDIO_ACTIVITY_TYPES.map((a) => {
                      const selected = audioActivityType === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setAudioActivityType(a.id)}
                          disabled={audioBusy}
                          className="px-2 py-1 text-[11px] font-semibold rounded-full border transition-colors"
                          style={
                            selected
                              ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                              : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                          }
                        >
                          {a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="block">
                  <span className="text-[11px] font-semibold text-gray-700">
                    Notes <span className="text-gray-400 font-normal">(optional)</span>
                  </span>
                  <textarea
                    value={audioInstructions}
                    onChange={(e) => setAudioInstructions(e.target.value)}
                    placeholder="E.g. include key vocabulary..."
                    rows={2}
                    disabled={audioBusy}
                    className="mt-1 w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
                    style={{ borderColor: "#DAD8D0" }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleAudioGenerate}
                  disabled={audioBusy || (!audioTopic.trim() && !audioScript.trim())}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
                >
                  {audioBusy ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate audio activity
                    </>
                  )}
                </button>
                {audioError && (
                  <p className="text-[10px] text-red-600">{audioError}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-2">
                  Generation takes ~10–15 seconds. A new slide will be inserted into your deck with the audio player, transcript, and questions.
                </p>
              </div>
            )}

            {active === "video" && (
              <div className="space-y-3">
                {/* Sub-tabs: Suggest with AI / YouTube / Upload */}
                <div
                  className="flex gap-1 overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none" }}
                >
                  {(["ai", "youtube", "upload"] as VideoSubTab[]).map((id) => (
                    <button
                      key={id}
                      onClick={() => setVideoSubTab(id)}
                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        videoSubTab === id
                          ? "bg-violet-100 text-violet-700"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {VIDEO_SUB_TAB_LABELS[id]}
                    </button>
                  ))}
                </div>

                {videoSubTab === "ai" && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={videoSuggestTopic}
                      onChange={(e) => { setVideoSuggestTopic(e.target.value); setVideoSuggestError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSuggestVideo(); } }}
                      placeholder="e.g. how volcanoes erupt"
                      disabled={videoSuggestBusy}
                      className="w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                      style={{ borderColor: "#DAD8D0" }}
                    />
                    <button
                      type="button"
                      onClick={handleSuggestVideo}
                      disabled={!videoSuggestTopic.trim() || videoSuggestBusy}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: "#7c3aed", color: "#fff" }}
                    >
                      {videoSuggestBusy ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Finding a video…
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Suggest a video
                        </>
                      )}
                    </button>
                    {videoSuggestError && <p className="text-[10px] text-red-600">{videoSuggestError}</p>}
                  </div>
                )}

                {videoSubTab === "youtube" && (
                  <div className="space-y-1.5">
                    <input
                      type="url"
                      value={videoUrl}
                      onChange={(e) => { setVideoUrl(e.target.value); setVideoUrlError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddYouTube(); } }}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                      style={{ borderColor: "#DAD8D0" }}
                    />
                    <button
                      type="button"
                      onClick={handleAddYouTube}
                      disabled={!videoUrl.trim()}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
                    >
                      Add YouTube video
                    </button>
                    {videoUrlError && <p className="text-[10px] text-red-600">{videoUrlError}</p>}
                  </div>
                )}

                {videoSubTab === "upload" && (
                  <div>
                    <button
                      onClick={() => videoFileRef.current?.click()}
                      disabled={videoUploading}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
                    >
                      {videoUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Film className="w-3.5 h-3.5" />
                          Choose a video file
                        </>
                      )}
                    </button>
                    <input
                      ref={videoFileRef}
                      type="file"
                      accept="video/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleVideoFile(file);
                        e.target.value = "";
                      }}
                    />
                    {videoUploadError && <p className="text-[10px] text-red-600 mt-1">{videoUploadError}</p>}
                    <p className="text-[10px] text-gray-400 mt-2">MP4 / WebM up to ~50 MB. Stored in your Supabase project.</p>
                  </div>
                )}
              </div>
            )}

            {active === "text" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <button
                    onClick={() => onAddText("heading")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-xl font-bold text-gray-900">Add a heading</p>
                  </button>
                  <button
                    onClick={() => onAddText("subheading")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-base font-semibold text-gray-700">Add a subheading</p>
                  </button>
                  <button
                    onClick={() => onAddText("body")}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    <p className="text-sm text-gray-600">Add body text</p>
                  </button>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Fonts</p>
                  <div className="space-y-1">
                    {GOOGLE_FONTS.map((f) => (
                      <button
                        key={f.name}
                        onClick={() => onAddText("heading", f.family)}
                        title={`Add heading in ${f.name}`}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 truncate"
                        style={{ fontFamily: f.family, fontSize: 16 }}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
      </div>
    </div>
  );
}
