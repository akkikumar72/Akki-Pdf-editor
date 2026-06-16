import type { ReactNode } from "react";
import { EditorContext } from "./editorContext";
import { useEditorController } from "./useEditorController";

export function EditorProvider({ children }: { children: ReactNode }) {
  const controller = useEditorController();
  return <EditorContext.Provider value={controller}>{children}</EditorContext.Provider>;
}
