import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { pdfjs } from "react-pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { EditorProvider } from "./state/EditorProvider";
import { LandingRoute } from "./routes/LandingRoute";
import { EditorRoute } from "./routes/EditorRoute";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export function App() {
  return (
    <BrowserRouter>
      <EditorProvider>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/pdf-editor" element={<EditorRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </EditorProvider>
    </BrowserRouter>
  );
}
