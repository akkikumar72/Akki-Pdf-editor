import { createContext, useContext } from "react";
import type { TextOperation } from "../types/editor";

export type TextPreview = { id: string; patch: Partial<TextOperation> } | null;

// Isolated from EditorContext on purpose: this is a high-frequency hover
// state (font menu keyboard/mouse navigation) that only the Inspector and
// PdfCanvas need. Keeping it off the main controller object means those
// hover updates don't re-render every `useEditor()` consumer (ToolRibbon,
// StatusBar, AppShell, ...).
//
// The provider component lives in `TextPreviewProvider.tsx` (mirroring
// editorContext.ts / EditorProvider.tsx) so this file only exports hooks and
// constants, keeping react-refresh's only-export-components check clean.
export const TextPreviewStateContext = createContext<TextPreview>(null);
export const TextPreviewDispatchContext = createContext<(id: string, patch?: Partial<TextOperation>) => void>(
  () => {},
);

export function useTextPreview(): TextPreview {
  return useContext(TextPreviewStateContext);
}

export function useTextPreviewDispatch(): (id: string, patch?: Partial<TextOperation>) => void {
  return useContext(TextPreviewDispatchContext);
}
