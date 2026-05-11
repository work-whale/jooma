// Frame definitions — applied to images via CSS clip-path / border-radius.
// PPTX export currently falls back to rectangular (clip-path doesn't translate cleanly).

export type FrameShape =
  | "none"
  | "circle"
  | "rounded"
  | "pill"
  | "diamond"
  | "hexagon"
  | "star"
  | "arch";

export interface FrameStyle {
  clipPath?: string;
  borderRadius?: string;
}

export function getFrameStyle(frame: FrameShape | undefined): FrameStyle {
  switch (frame) {
    case "circle":
      return { clipPath: "circle(50% at 50% 50%)" };
    case "rounded":
      return { borderRadius: "16%" };
    case "pill":
      return { borderRadius: "9999px" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "hexagon":
      return {
        clipPath:
          "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
      };
    case "star":
      return {
        clipPath:
          "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
      };
    case "arch":
      return { borderRadius: "50% 50% 8% 8% / 60% 60% 8% 8%" };
    case "none":
    default:
      return {};
  }
}

// Used to render preview thumbnails on the Frames picker (the swatch shapes).
export const FRAME_OPTIONS: { id: FrameShape; label: string }[] = [
  { id: "none", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "circle", label: "Circle" },
  { id: "pill", label: "Pill" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
  { id: "star", label: "Star" },
  { id: "arch", label: "Arch" },
];
