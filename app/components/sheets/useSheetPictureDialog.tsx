"use client";

import { useState } from "react";
import { updateBlockById } from "@/app/lib/sheets/edit";
import { sheetImages } from "@/app/lib/sheets/normalize";
import type { SheetDoc } from "@/app/lib/sheets/types";
import SheetPictureDialog, { type PictureTab } from "./SheetPictureDialog";

/**
 * The picture chooser for a sheet on screen, shared by the signed in
 * workspace and the guest result. `onPicture` opens it for a picture block, by
 * id (from the page or the Design panel); `dialog` is the element to render.
 * The chosen picture goes through `commit`, so it can be undone like any edit.
 */
export function useSheetPictureDialog({
  doc,
  commit,
  locked,
  onLocked,
}: {
  /** Null while there is no sheet yet (a guest's result before it streams). */
  doc: SheetDoc | null;
  commit: (next: SheetDoc) => void;
  locked?: PictureTab[];
  onLocked?: () => void;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const block = openFor && doc ? sheetImages(doc).find((b) => b.id === openFor) ?? null : null;

  const dialog = block && doc ? (
    <SheetPictureDialog
      key={block.id}
      block={block}
      locked={locked}
      onLocked={onLocked}
      onClose={() => setOpenFor(null)}
      onPick={({ src, width, height, source, query }) =>
        commit(
          updateBlockById(doc, block.id, {
            src,
            width,
            height,
            source,
            // A picture added by hand has no search yet: what it was made
            // from, or found by, becomes its search and its description.
            query: block.query || query || "",
            alt: block.alt || query || doc.title || "Picture",
          }),
        )
      }
    />
  ) : null;

  return { onPicture: setOpenFor, dialog };
}
