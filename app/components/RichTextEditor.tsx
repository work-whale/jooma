"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "tiptap-markdown";
import { useEffect, useRef, useState } from "react";
import {
  Undo2, Redo2, Bold, Italic,
  Underline as LucideUnderline,
  Highlighter, Baseline,
  Subscript as LucideSubscript,
  Superscript as LucideSuperscript,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Indent, Outdent,
  Table, Link as LucideLink,
  Minus, Trash2,
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        active ? "bg-gray-200 text-gray-900" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-4 bg-gray-300 mx-0.5 shrink-0" />;
}

export default function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: false }),
      TextStyle,
      Color,
      Subscript,
      Superscript,
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      TableKit,
      Markdown.configure({ html: false, transformPastedText: true }),
    ],
    content: value,
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((editor.storage as any).markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: "prose-editor focus:outline-none min-h-96 text-sm leading-relaxed",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value);
    }
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!editor) return <div className="py-20 px-24 min-h-96" />;

  const handleSetLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  };

  const openLinkInput = () => {
    const prev = editor.getAttributes("link").href ?? "";
    setLinkUrl(prev);
    setShowLinkInput(true);
    setTimeout(() => linkInputRef.current?.focus(), 0);
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  const COLORS = [
    "#000000", "#374151", "#6B7280", "#EF4444", "#F97316",
    "#EAB308", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899",
  ];

  return (
    <div>
      {/* Toolbar */}
      <div className="sticky top-22.25 z-10 flex items-center flex-wrap gap-0.5 px-3 py-2 border-b border-gray-200 bg-gray-50">

        {/* Undo / Redo */}
        <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        {/* Paragraph style */}
        <select
          value={
            editor.isActive("heading", { level: 1 }) ? "h1"
            : editor.isActive("heading", { level: 2 }) ? "h2"
            : editor.isActive("heading", { level: 3 }) ? "h3"
            : "p"
          }
          onChange={(e) => {
            const val = e.target.value;
            if (val === "p") editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: parseInt(val[1]) as 1 | 2 | 3 }).run();
          }}
          className="h-7 bg-white border border-gray-200 rounded px-1.5 text-xs text-gray-700 focus:outline-none cursor-pointer"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>

        <Sep />

        {/* Bold / Italic / Underline */}
        <Btn title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <Bold className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <Italic className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Underline" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
          <LucideUnderline className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        {/* Highlight */}
        <Btn title="Highlight" onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")}>
          <Highlighter className="w-3.5 h-3.5" />
        </Btn>

        {/* Text color */}
        <div className="relative" ref={colorPickerRef}>
          <Btn title="Text color" onClick={() => setShowColorPicker((p) => !p)} active={showColorPicker}>
            <Baseline className="w-3.5 h-3.5" />
          </Btn>
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1.5 flex-wrap w-32">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  title={color}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().setColor(color).run();
                    setShowColorPicker(false);
                  }}
                  className="w-5 h-5 rounded-full border border-gray-300 hover:scale-110 transition-transform"
                  style={{ background: color }}
                />
              ))}
              <button
                type="button"
                title="Remove color"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="w-5 h-5 rounded-full border border-gray-300 bg-white text-gray-400 text-[10px] flex items-center justify-center hover:scale-110 transition-transform"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        <Sep />

        {/* Subscript / Superscript */}
        <Btn title="Subscript" onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")}>
          <LucideSubscript className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Superscript" onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")}>
          <LucideSuperscript className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        {/* Alignment */}
        <Btn title="Align left" onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
          <AlignLeft className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Align center" onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
          <AlignCenter className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Align right" onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
          <AlignRight className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        {/* Lists */}
        <Btn title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <List className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <ListOrdered className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Indent" onClick={() => editor.chain().focus().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}>
          <Indent className="w-3.5 h-3.5" />
        </Btn>
        <Btn title="Outdent" onClick={() => editor.chain().focus().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}>
          <Outdent className="w-3.5 h-3.5" />
        </Btn>

        <Sep />

        {/* Table */}
        <Btn title="Insert table" onClick={insertTable}>
          <Table className="w-3.5 h-3.5" />
        </Btn>
        {editor.isActive("table") && (
          <>
            <Btn title="Add column after" onClick={() => editor.chain().focus().addColumnAfter().run()}>
              <span className="text-[10px] font-bold">C+</span>
            </Btn>
            <Btn title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
              <span className="text-[10px] font-bold">C-</span>
            </Btn>
            <Btn title="Add row after" onClick={() => editor.chain().focus().addRowAfter().run()}>
              <span className="text-[10px] font-bold">R+</span>
            </Btn>
            <Btn title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
              <span className="text-[10px] font-bold">R-</span>
            </Btn>
            <Btn title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
              <Trash2 className="w-3.5 h-3.5" />
            </Btn>
          </>
        )}

        <Sep />

        {/* Link */}
        <Btn title="Link" onClick={openLinkInput} active={editor.isActive("link")}>
          <LucideLink className="w-3.5 h-3.5" />
        </Btn>

        {/* Divider line */}
        <Btn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="w-3.5 h-3.5" />
        </Btn>
      </div>

      {/* Link input bar */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-blue-50">
          <LucideLink className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetLink();
              if (e.key === "Escape") setShowLinkInput(false);
            }}
            placeholder="https://..."
            className="flex-1 text-xs bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSetLink(); }}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Apply
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setShowLinkInput(false); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Editor area */}
      <div className="py-20 px-24 bg-white">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .prose-editor h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; }
        .prose-editor h2 { font-size: 1.125rem; font-weight: 700; margin-top: 2rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid #e5e7eb; }
        .prose-editor h3 { font-size: 0.875rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; }
        .prose-editor p { margin: 0.4rem 0; }
        .prose-editor ul { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
        .prose-editor ol { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
        .prose-editor li { margin: 0.2rem 0; }
        .prose-editor li > ul, .prose-editor li > ol { margin: 0.25rem 0; }
        .prose-editor hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
        .prose-editor strong { font-weight: 600; }
        .prose-editor em { font-style: italic; }
        .prose-editor u { text-decoration: underline; }
        .prose-editor mark { background: #fef08a; border-radius: 2px; padding: 0 2px; }
        .prose-editor a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
        .prose-editor table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        .prose-editor td, .prose-editor th { border: 1px solid #e5e7eb; padding: 6px 12px; text-align: left; vertical-align: top; }
        .prose-editor th { background: #f9fafb; font-weight: 600; }
        .prose-editor sub { vertical-align: sub; font-size: smaller; }
        .prose-editor sup { vertical-align: super; font-size: smaller; }
        .prose-editor .selectedCell { background: #eff6ff; }
        .prose-editor p.is-editor-empty:first-child::before { color: rgba(0,0,0,0.2); content: attr(data-placeholder); float: left; height: 0; pointer-events: none; }
      `}</style>
    </div>
  );
}
