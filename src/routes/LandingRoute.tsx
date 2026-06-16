import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ToolHub } from "../components/ToolHub";
import { useEditor } from "../state/editorContext";

export function LandingRoute() {
  const editor = useEditor();
  const navigate = useNavigate();
  const { refreshRecentSessions } = editor;

  useEffect(() => {
    void refreshRecentSessions();
  }, [refreshRecentSessions]);

  return (
    <ToolHub
      isBusy={editor.isBusy}
      status={editor.status}
      recentSessions={editor.recentSessions}
      onBlank={async () => {
        if (await editor.openBlank()) navigate("/pdf-editor");
      }}
      onClearSessions={editor.clearSavedSessions}
      onDeleteSession={editor.removeSavedSession}
      onOpen={async (file) => {
        if (await editor.openFile(file)) navigate("/pdf-editor");
      }}
      onResume={async (id) => {
        if (await editor.resumeSession(id)) navigate("/pdf-editor");
      }}
    />
  );
}
