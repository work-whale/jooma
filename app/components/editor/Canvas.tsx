"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export type FabricSelection = {
  type: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  underline?: boolean;
  textAlign?: string;
  rx?: number;
  [k: string]: unknown;
} | null;

export interface CanvasHandle {
  addText: (preset: "heading" | "subheading" | "body") => void;
  addShape: (type: "rect" | "ellipse" | "triangle" | "line") => void;
  addImage: (dataUrl: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  toJSON: () => object;
  loadJSON: (json: object) => Promise<void>;
  toDataURL: (multiplier?: number) => string;
  updateSelected: (props: Record<string, unknown>) => void;
}

interface Props {
  onSelectionChange?: (sel: FabricSelection) => void;
  onChange?: () => void;
  onReady?: () => void;
}

const HISTORY_MAX = 50;

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { onSelectionChange, onChange, onReady },
  ref,
) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const containerEl = useRef<HTMLDivElement>(null);
  const fc = useRef<any>(null);
  const fabricMod = useRef<any>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const suppressHistory = useRef(false);
  const [scale, setScale] = useState(1);

  const fitToContainer = useCallback(() => {
    const c = containerEl.current;
    if (!c) return;
    const { width, height } = c.getBoundingClientRect();
    if (!width || !height) return;
    const margin = 48; // breathing room on all sides
    const s = Math.min((width - margin) / SLIDE_W, (height - margin) / SLIDE_H, 1);
    setScale(s > 0 ? s : 1);
  }, []);

  const pushHistory = useCallback(() => {
    if (suppressHistory.current || !fc.current) return;
    const json = JSON.stringify(fc.current.toJSON());
    if (history.current[historyIndex.current] === json) return;
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(json);
    if (history.current.length > HISTORY_MAX) {
      history.current.shift();
    } else {
      historyIndex.current++;
    }
  }, []);

  // Fabric initialization (synchronous after dynamic import)
  useEffect(() => {
    let disposed = false;

    (async () => {
      const fabric = (await import("fabric")) as any;
      fabricMod.current = fabric;
      if (disposed || !canvasEl.current) return;

      const canvas = new fabric.Canvas(canvasEl.current, {
        width: SLIDE_W,
        height: SLIDE_H,
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
        enableRetinaScaling: true,
        selection: true,
      });
      fc.current = canvas;

      const fireSelection = () => {
        const obj = canvas.getActiveObject();
        if (!obj) return onSelectionChange?.(null);
        const data: FabricSelection = {
          type: obj.type as string,
          fill: obj.fill as string,
          stroke: obj.stroke as string,
          strokeWidth: obj.strokeWidth as number,
          opacity: obj.opacity as number,
          fontSize: obj.fontSize as number,
          fontFamily: obj.fontFamily as string,
          fontWeight: obj.fontWeight as string,
          fontStyle: obj.fontStyle as string,
          underline: obj.underline as boolean,
          textAlign: obj.textAlign as string,
          rx: obj.rx as number,
        };
        onSelectionChange?.(data);
      };

      canvas.on("selection:created", fireSelection);
      canvas.on("selection:updated", fireSelection);
      canvas.on("selection:cleared", () => onSelectionChange?.(null));
      canvas.on("object:added", () => {
        pushHistory();
        onChange?.();
      });
      canvas.on("object:modified", () => {
        pushHistory();
        onChange?.();
        fireSelection();
      });
      canvas.on("object:removed", () => {
        pushHistory();
        onChange?.();
      });

      pushHistory();
      fitToContainer();
      onReady?.();
    })();

    return () => {
      disposed = true;
      fc.current?.dispose();
      fc.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver — recompute CSS scale only (no Fabric mutation)
  useEffect(() => {
    const c = containerEl.current;
    if (!c) return;
    const obs = new ResizeObserver(fitToContainer);
    obs.observe(c);
    return () => obs.disconnect();
  }, [fitToContainer]);

  // Keyboard: Delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && fc.current?.getActiveObject()) {
        const o = fc.current.getActiveObject();
        if (o.isEditing) return; // Textbox editing mode
        fc.current.getActiveObjects().forEach((x: any) => fc.current.remove(x));
        fc.current.discardActiveObject();
        fc.current.renderAll();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useImperativeHandle(ref, () => ({
    addText: (preset) => {
      const fabric = fabricMod.current;
      const canvas = fc.current;
      if (!fabric || !canvas) return;
      const presets = {
        heading: { fontSize: 72, fontWeight: "bold", text: "Heading" },
        subheading: { fontSize: 48, fontWeight: "600", text: "Subheading" },
        body: { fontSize: 24, fontWeight: "normal", text: "Body text" },
      } as const;
      const p = presets[preset];
      const tb = new fabric.Textbox(p.text, {
        left: SLIDE_W / 2 - 200,
        top: SLIDE_H / 2 - p.fontSize / 2,
        width: 400,
        fontSize: p.fontSize,
        fontWeight: p.fontWeight,
        fill: "#1a1a2e",
        fontFamily: "Inter, sans-serif",
        textAlign: "left",
      });
      canvas.add(tb);
      canvas.setActiveObject(tb);
      canvas.renderAll();
    },

    addShape: (type) => {
      const fabric = fabricMod.current;
      const canvas = fc.current;
      if (!fabric || !canvas) return;
      const cx = SLIDE_W / 2;
      const cy = SLIDE_H / 2;
      let shape: any;
      if (type === "rect") {
        shape = new fabric.Rect({ left: cx - 150, top: cy - 90, width: 300, height: 180, fill: "#7c3aed" });
      } else if (type === "ellipse") {
        shape = new fabric.Ellipse({ left: cx - 120, top: cy - 120, rx: 120, ry: 120, fill: "#7c3aed" });
      } else if (type === "triangle") {
        shape = new fabric.Triangle({ left: cx - 120, top: cy - 120, width: 240, height: 240, fill: "#7c3aed" });
      } else if (type === "line") {
        shape = new fabric.Line([cx - 200, cy, cx + 200, cy], { stroke: "#1a1a2e", strokeWidth: 4 });
      }
      if (shape) {
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.renderAll();
      }
    },

    addImage: async (dataUrl) => {
      const fabric = fabricMod.current;
      const canvas = fc.current;
      if (!fabric || !canvas) return;
      const img = await fabric.FabricImage.fromURL(dataUrl, { crossOrigin: "anonymous" });
      const maxW = SLIDE_W * 0.6;
      const maxH = SLIDE_H * 0.6;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      img.set({
        left: SLIDE_W / 2 - (img.width * s) / 2,
        top: SLIDE_H / 2 - (img.height * s) / 2,
        scaleX: s,
        scaleY: s,
      });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
    },

    undo: () => {
      if (historyIndex.current <= 0) return;
      historyIndex.current--;
      const json = history.current[historyIndex.current];
      const canvas = fc.current;
      if (!canvas) return;
      suppressHistory.current = true;
      canvas.loadFromJSON(JSON.parse(json)).then(() => {
        canvas.renderAll();
        suppressHistory.current = false;
        onChange?.();
      });
    },

    redo: () => {
      if (historyIndex.current >= history.current.length - 1) return;
      historyIndex.current++;
      const json = history.current[historyIndex.current];
      const canvas = fc.current;
      if (!canvas) return;
      suppressHistory.current = true;
      canvas.loadFromJSON(JSON.parse(json)).then(() => {
        canvas.renderAll();
        suppressHistory.current = false;
        onChange?.();
      });
    },

    deleteSelected: () => {
      const canvas = fc.current;
      if (!canvas) return;
      canvas.getActiveObjects().forEach((o: any) => canvas.remove(o));
      canvas.discardActiveObject();
      canvas.renderAll();
    },

    bringForward: () => {
      const canvas = fc.current;
      const obj = canvas?.getActiveObject();
      if (!canvas || !obj) return;
      canvas.bringObjectForward(obj);
      canvas.renderAll();
      onChange?.();
    },

    sendBackward: () => {
      const canvas = fc.current;
      const obj = canvas?.getActiveObject();
      if (!canvas || !obj) return;
      canvas.sendObjectBackwards(obj);
      canvas.renderAll();
      onChange?.();
    },

    toJSON: () => {
      return fc.current ? (fc.current.toJSON() as object) : { objects: [] };
    },

    toDataURL: (multiplier = 1) => {
      return fc.current?.toDataURL({ format: "png", multiplier }) ?? "";
    },

    loadJSON: async (json) => {
      const canvas = fc.current;
      if (!canvas) return;
      suppressHistory.current = true;
      await canvas.loadFromJSON(json);
      canvas.renderAll();
      // Reset history for the new slide
      history.current = [JSON.stringify(canvas.toJSON())];
      historyIndex.current = 0;
      suppressHistory.current = false;
    },

    updateSelected: (props) => {
      const canvas = fc.current;
      const obj = canvas?.getActiveObject();
      if (!canvas || !obj) return;
      obj.set(props);
      canvas.renderAll();
      pushHistory();
      onChange?.();
    },
  }));

  return (
    <div
      ref={containerEl}
      className="flex-1 min-h-0 min-w-0 flex items-center justify-center bg-gray-300 overflow-hidden"
    >
      <div
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        className="shadow-2xl bg-white"
      >
        <canvas ref={canvasEl} />
      </div>
    </div>
  );
});

export default Canvas;
