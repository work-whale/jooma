"use client";

import { Lock } from "lucide-react";
import {
  DEFAULT_PICTURES,
  PICTURE_SOURCES,
  PICTURE_STYLES,
  type PictureSource,
  type SheetPictures,
} from "@/app/lib/sheets/picture-options";

interface Props {
  /** Null for no pictures. */
  value: SheetPictures | null;
  onChange: (v: SheetPictures | null) => void;
  /** Set on a free try: web pictures work, but the other sources come with a
   *  subscription. They are shown with a lock, and choosing one calls this
   *  (the sign up prompt) instead. */
  onLocked?: () => void;
}

/**
 * "Add pictures" on the Worksheet and Comprehension forms: an on/off switch
 * that reveals where the pictures come from, the same choices as a
 * slideshow's images, and the style for generated ones.
 */
export default function PicturesField({ value, onChange, onLocked }: Props) {
  const on = value !== null;
  const locked = (source: PictureSource) => !!onLocked && source !== "web";
  const pick = (source: PictureSource) => {
    if (locked(source)) return onLocked!();
    onChange({ ...(value ?? DEFAULT_PICTURES), source });
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3" data-testid="pictures-field">
      <label className="flex items-center justify-between gap-3 text-sm font-semibold text-gray-800 cursor-pointer">
        <span className="flex flex-col">
          Add pictures
          <span className="text-xs font-normal text-gray-500">Up to three pictures about your topic. You can change them afterwards.</span>
        </span>
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? { ...DEFAULT_PICTURES } : null)}
          className="w-4 h-4 accent-gray-900 cursor-pointer"
        />
      </label>

      {value && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Where pictures come from">
            {PICTURE_SOURCES.map((s) => {
              const selected = value.source === s.id;
              const isLocked = locked(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pick(s.id)}
                  data-locked={isLocked ? "true" : undefined}
                  title={isLocked ? "Comes with a subscription" : s.hint}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                    selected ? "bg-stone-700 text-white border-stone-700" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {s.label}
                  {isLocked && <Lock className="w-3 h-3" aria-label="Locked" />}
                </button>
              );
            })}
          </div>

          {value.source !== "web" && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-gray-600">Picture style</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Picture style">
                  {PICTURE_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={value.style === s.id}
                      onClick={() => onChange({ ...value, style: s.id })}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                        value.style === s.id ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* As on the slideshow form: generated pictures cost real money
                  each, web search is free. */}
              <p className="text-[11px] leading-relaxed rounded-lg px-2.5 py-2" style={{ backgroundColor: "var(--j-orange-bg)", color: "var(--j-orange-ink)" }}>
                <span className="font-semibold">Generated pictures use more credits.</span> Web search pictures are free, and are the default.
              </p>
            </>
          )}

          {onLocked && (
            <p className="text-xs text-gray-500">
              <Lock className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden="true" />
              Made-for-you pictures come with a subscription.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
