"use client";

/*
 * The speaker notes under the slide: what the presenter says. Staff Slides
 * and assembly decks have them (app/lib/staff-deck-prompt.ts); a pupil deck
 * never shows this panel. Exported to PowerPoint as the slide's notes.
 */
export default function SpeakerNotesPanel({
  notes,
  onChange,
  width,
  disabled,
}: {
  notes: string;
  onChange: (notes: string) => void;
  width: number;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 shrink-0" style={{ width: Math.max(320, width) }} data-editor-chrome="notes">
      <label htmlFor="speaker-notes" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        Speaker notes
      </label>
      <textarea
        id="speaker-notes"
        data-testid="speaker-notes"
        value={notes}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        rows={4}
        placeholder="What you will say on this slide. Not shown on the slide; included in PowerPoint as notes."
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-300 resize-y"
      />
    </div>
  );
}
