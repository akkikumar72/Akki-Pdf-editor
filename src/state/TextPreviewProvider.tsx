import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { TextOperation } from "../types/editor";
import { TextPreviewDispatchContext, TextPreviewStateContext, type TextPreview } from "./textPreviewContext";

export function TextPreviewProvider({
  selectedIds,
  children,
}: {
  selectedIds: string[];
  children: ReactNode;
}) {
  const [textPreview, setTextPreview] = useState<TextPreview>(null);
  const previewTextOperation = useCallback((id: string, patch?: Partial<TextOperation>) => {
    setTextPreview(patch ? { id, patch } : null);
  }, []);

  // Cleared whenever the selection changes so a stale hover patch can't stick.
  useEffect(() => {
    setTextPreview(null);
  }, [selectedIds]);

  return (
    <TextPreviewDispatchContext.Provider value={previewTextOperation}>
      <TextPreviewStateContext.Provider value={textPreview}>{children}</TextPreviewStateContext.Provider>
    </TextPreviewDispatchContext.Provider>
  );
}
