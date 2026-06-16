import { createContext, useContext } from "react";
import type { EditorController } from "./useEditorController";

export const EditorContext = createContext<EditorController | null>(null);

export function useEditor(): EditorController {
  const value = useContext(EditorContext);
  if (!value) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return value;
}
