"use client";

import { useEffect, useRef } from "react";
import {
  Copy,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  Sparkles,
  Lock,
  LockOpen,
  Trash2,
  ImagePlus,
  Image as ImageIcon,
  Plus,
} from "lucide-react";

export type ContextMenuKind = "text" | "shape" | "image" | "slide";

export interface ContextMenuState {
  x: number;
  y: number;
  kind: ContextMenuKind;
  locked: boolean;
  flipX?: boolean;
  flipY?: boolean;
  shadow?: boolean;
  hasBackgroundImage?: boolean;
  canDeleteSlide?: boolean;
}

interface Props {
  state: ContextMenuState;
  // Object actions (text/shape/image)
  onDuplicate?: () => void;
  onReorder?: (op: "front" | "back" | "forward" | "backward") => void;
  onToggleFlipX?: () => void;
  onToggleFlipY?: () => void;
  onToggleShadow?: () => void;
  onToggleLock?: () => void;
  onDelete?: () => void;
  // Slide actions
  onAddSlide?: () => void;
  onDuplicateSlide?: () => void;
  onDeleteSlide?: () => void;
  onChangeBackgroundImage?: () => void;
  onRemoveBackgroundImage?: () => void;
  onClose: () => void;
}

interface Item {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  destructive?: boolean;
  onClick: () => void;
}

function Divider() {
  return <div className="h-px bg-gray-200 my-1" />;
}

export default function ContextMenu({
  state,
  onDuplicate,
  onReorder,
  onToggleFlipX,
  onToggleFlipY,
  onToggleShadow,
  onToggleLock,
  onDelete,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onChangeBackgroundImage,
  onRemoveBackgroundImage,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);

  const click = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const items: (Item | "divider")[] = [];

  if (state.kind === "slide") {
    if (onChangeBackgroundImage) {
      items.push({
        icon: state.hasBackgroundImage ? <ImageIcon className="w-3.5 h-3.5" /> : <ImagePlus className="w-3.5 h-3.5" />,
        label: state.hasBackgroundImage ? "Replace background image" : "Add background image",
        onClick: click(onChangeBackgroundImage),
      });
    }
    if (state.hasBackgroundImage && onRemoveBackgroundImage) {
      items.push({
        icon: <Trash2 className="w-3.5 h-3.5" />,
        label: "Remove background image",
        onClick: click(onRemoveBackgroundImage),
      });
    }
    items.push("divider");
    if (onAddSlide) {
      items.push({
        icon: <Plus className="w-3.5 h-3.5" />,
        label: "Add new slide",
        onClick: click(onAddSlide),
      });
    }
    if (onDuplicateSlide) {
      items.push({
        icon: <Copy className="w-3.5 h-3.5" />,
        label: "Duplicate slide",
        onClick: click(onDuplicateSlide),
      });
    }
    if (onDeleteSlide && state.canDeleteSlide) {
      items.push({
        icon: <Trash2 className="w-3.5 h-3.5" />,
        label: "Delete slide",
        destructive: true,
        onClick: click(onDeleteSlide),
      });
    }
  } else {
    if (onDuplicate) {
      items.push({ icon: <Copy className="w-3.5 h-3.5" />, label: "Duplicate", shortcut: "Ctrl+D", onClick: click(onDuplicate) });
      items.push("divider");
    }
    if (onReorder) {
      items.push({ icon: <ArrowUpToLine className="w-3.5 h-3.5" />, label: "Bring to front", onClick: click(() => onReorder("front")) });
      items.push({ icon: <ChevronUp className="w-3.5 h-3.5" />, label: "Bring forward", onClick: click(() => onReorder("forward")) });
      items.push({ icon: <ChevronDown className="w-3.5 h-3.5" />, label: "Send backward", onClick: click(() => onReorder("backward")) });
      items.push({ icon: <ArrowDownToLine className="w-3.5 h-3.5" />, label: "Send to back", onClick: click(() => onReorder("back")) });
    }

    if (onToggleFlipX || onToggleFlipY) {
      items.push("divider");
      if (onToggleFlipX) {
        items.push({
          icon: <FlipHorizontal2 className="w-3.5 h-3.5" />,
          label: "Flip horizontal",
          active: !!state.flipX,
          onClick: click(onToggleFlipX),
        });
      }
      if (onToggleFlipY) {
        items.push({
          icon: <FlipVertical2 className="w-3.5 h-3.5" />,
          label: "Flip vertical",
          active: !!state.flipY,
          onClick: click(onToggleFlipY),
        });
      }
    }

    if (onToggleShadow) {
      items.push({
        icon: <Sparkles className="w-3.5 h-3.5" />,
        label: "Drop shadow",
        active: !!state.shadow,
        onClick: click(onToggleShadow),
      });
    }

    if (onToggleLock || onDelete) items.push("divider");
    if (onToggleLock) {
      items.push({
        icon: state.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />,
        label: state.locked ? "Unlock" : "Lock",
        onClick: click(onToggleLock),
      });
    }
    if (onDelete) {
      items.push({
        icon: <Trash2 className="w-3.5 h-3.5" />,
        label: "Delete",
        shortcut: "Del",
        destructive: true,
        onClick: click(onDelete),
      });
    }
  }

  return (
    <div
      ref={ref}
      className="fixed bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-56 z-100"
      style={{ left: state.x, top: state.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        if (item === "divider") return <Divider key={`d${idx}`} />;
        return (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
              item.destructive
                ? "text-red-600 hover:bg-red-50"
                : item.active
                ? "bg-violet-50 text-violet-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="w-4 flex items-center justify-center">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-[10px] text-gray-400 font-mono">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}
