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
  | "arch"
  | "chevron"
  | "parallelogram"
  | "blob"
  | "scalloped"
  | "heart"
  | "octagon"
  | "shield"
  | "triangle";

export interface FrameStyle {
  clipPath?: string;
  borderRadius?: string;
}

// `cornerRadius` is a percentage (0-50) that applies to shapes which use border-radius
// (rounded, pill, none). The other shapes use a fixed clip-path and ignore it.
export function getFrameStyle(
  frame: FrameShape | undefined,
  cornerRadius?: number,
): FrameStyle {
  switch (frame) {
    case "circle":
      return { clipPath: "circle(50% at 50% 50%)" };
    case "rounded":
      return { borderRadius: `${cornerRadius ?? 16}%` };
    case "pill":
      return { borderRadius: `${cornerRadius ?? 50}%` };
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
    case "chevron":
      return {
        clipPath:
          "polygon(0% 0%, 80% 0%, 100% 50%, 80% 100%, 0% 100%, 20% 50%)",
      };
    case "parallelogram":
      return {
        clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)",
      };
    case "blob":
      return {
        borderRadius: "63% 37% 54% 46% / 55% 48% 52% 45%",
      };
    case "scalloped":
      return {
        // 16-point scalloped border using radial gradient mask approximated via polygon.
        // A clean scallop needs an SVG mask in production — this polygon stays close.
        clipPath:
          "polygon(50% 0%, 60% 8%, 73% 5%, 78% 17%, 91% 17%, 92% 30%, 100% 39%, 95% 52%, 100% 65%, 92% 73%, 91% 86%, 78% 86%, 73% 96%, 60% 92%, 50% 100%, 40% 92%, 27% 96%, 22% 86%, 9% 86%, 8% 73%, 0% 65%, 5% 52%, 0% 39%, 8% 30%, 9% 17%, 22% 17%, 27% 5%, 40% 8%)",
      };
    case "heart":
      return {
        clipPath:
          "path('M 50,90 C 50,75 10,55 10,30 C 10,10 35,5 50,25 C 65,5 90,10 90,30 C 90,55 50,75 50,90 Z')",
      };
    case "octagon":
      return {
        clipPath:
          "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
      };
    case "shield":
      return {
        clipPath:
          "polygon(50% 0%, 100% 18%, 92% 65%, 50% 100%, 8% 65%, 0% 18%)",
      };
    case "triangle":
      return {
        clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
      };
    case "none":
    default:
      return cornerRadius ? { borderRadius: `${cornerRadius}%` } : {};
  }
}

// Which frame shapes accept a custom corner-radius slider
export function frameSupportsRoundness(frame: FrameShape | undefined): boolean {
  return frame === "rounded" || frame === "pill" || frame === "none" || frame === undefined;
}

// Used to render preview thumbnails on the Frames picker (the swatch shapes).
export const FRAME_OPTIONS: { id: FrameShape; label: string }[] = [
  { id: "none", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "circle", label: "Circle" },
  { id: "pill", label: "Pill" },
  { id: "diamond", label: "Diamond" },
  { id: "hexagon", label: "Hexagon" },
  { id: "octagon", label: "Octagon" },
  { id: "star", label: "Star" },
  { id: "arch", label: "Arch" },
  { id: "chevron", label: "Chevron" },
  { id: "parallelogram", label: "Slant" },
  { id: "blob", label: "Blob" },
  { id: "scalloped", label: "Scallop" },
  { id: "heart", label: "Heart" },
  { id: "shield", label: "Shield" },
  { id: "triangle", label: "Triangle" },
];
