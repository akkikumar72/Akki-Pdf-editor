import type { LucideIcon } from "lucide-react";
import {
  Check,
  ChevronDown,
  Download,
  Eraser,
  FileDown,
  FileMinus,
  FilePlus,
  FileSpreadsheet,
  FileText,
  Highlighter,
  Image,
  Link2,
  MousePointer2,
  PenLine,
  Redo2,
  RotateCw,
  Rows3,
  Save,
  Search,
  Shapes,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, type ToolId } from "../constants";
import { jakarta } from "../fonts";
import { PdfDocument } from "./PdfDocument";

type Icon = LucideIcon;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const TOOL_ITEMS: Array<{ id: ToolId; label: string; icon: Icon }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "text", label: "Text", icon: Type },
  { id: "links", label: "Links", icon: Link2 },
  { id: "forms", label: "Forms", icon: Rows3 },
  { id: "images", label: "Images", icon: Image },
  { id: "sign", label: "Sign", icon: PenLine },
  { id: "whiteout", label: "Whiteout", icon: Eraser },
  { id: "annotate", label: "Annotate", icon: Highlighter },
  { id: "shapes", label: "Shapes", icon: Shapes },
];

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 7 }}>
      <svg width="29" height="29" viewBox="0 0 24 24" fill="none">
        <path
          fill={COLORS.accent}
          d="M6 2.75h9.19L19 6.56V19.25A2.25 2.25 0 0 1 16.75 21.5H6A2.25 2.25 0 0 1 3.75 19.25V5.25A2.25 2.25 0 0 1 6 2.75Z"
          opacity=".58"
        />
        <path fill={COLORS.accentDark} d="M15.25 2.75V7a1.25 1.25 0 0 0 1.25 1.25H19.5Z" />
        <path stroke={COLORS.accentDark} strokeWidth="1.5" strokeLinecap="round" d="M7.5 11.25h6.5M7.5 14.25h4.5" />
        <path fill={COLORS.accentDark} d="m16.72 14.03 3.25 3.25-1.94 1.94-3.25-3.25z" />
      </svg>
      <span
        style={{
          fontFamily: jakarta,
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          color: COLORS.ink,
        }}
      >
        AkkiPDF
      </span>
    </div>
  );
}

function ToolButton({ label, icon: IconComponent, active }: { label: string; icon: Icon; active: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 65,
        height: 63,
        border: `1px solid ${active ? COLORS.accentDark : COLORS.rule}`,
        borderRadius: 7,
        background: active ? COLORS.accentSoft : "rgba(255, 253, 245, 0.75)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        color: active ? COLORS.accentDark : COLORS.ink,
        boxShadow: active ? "0 0 0 3px rgba(73, 215, 122, 0.16)" : "0 2px 0 rgba(116, 101, 51, 0.08)",
      }}
    >
      <IconComponent size={21} strokeWidth={active ? 2.4 : 1.8} />
      <span style={{ fontFamily: jakarta, fontSize: 9.5, fontWeight: 700 }}>{label}</span>
    </div>
  );
}

function CompactButton({ icon: IconComponent, active = false }: { icon: Icon; active?: boolean }) {
  return (
    <div
      style={{
        width: 31,
        height: 31,
        border: `1px solid ${active ? COLORS.accentDark : COLORS.rule}`,
        borderRadius: 6,
        background: active ? COLORS.accentSoft : COLORS.surface,
        display: "grid",
        placeItems: "center",
        color: active ? COLORS.accentDark : COLORS.ink2,
        boxShadow: active ? "0 0 0 3px rgba(73, 215, 122, 0.14)" : "none",
      }}
    >
      <IconComponent size={15} strokeWidth={1.8} />
    </div>
  );
}

function Header({ activeTool }: { activeTool: ToolId }) {
  const frame = useCurrentFrame();
  const addingPage = frame >= 825 && frame < 870;
  const removingPage = frame >= 870 && frame < 915;
  return (
    <>
      <div
        style={{
          height: 91,
          padding: "14px 17px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: `1px solid ${COLORS.rule}`,
          background: "rgba(255, 253, 245, 0.97)",
        }}
      >
        <Logo />
        <div style={{ display: "flex", gap: 5 }}>
          {TOOL_ITEMS.map((tool) => (
            <ToolButton key={tool.id} label={tool.label} icon={tool.icon} active={activeTool === tool.id} />
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            height: 49,
            minWidth: 104,
            padding: "0 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            borderRadius: 18,
            color: "#113a22",
            background: COLORS.accent,
            border: `1px solid ${COLORS.accentDark}`,
            fontFamily: jakarta,
            fontWeight: 800,
            fontSize: 14,
            boxShadow:
              activeTool === "apply"
                ? "0 0 0 6px rgba(73, 215, 122, 0.24), 0 6px 0 -2px #178f49"
                : "0 5px 0 -2px #178f49",
          }}
        >
          {activeTool === "apply" ? <Check size={18} /> : <Save size={18} />}
          Apply
        </div>
        <div
          style={{
            height: 49,
            minWidth: 112,
            padding: "0 15px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 7,
            color: activeTool === "export" ? COLORS.accentDark : COLORS.ink,
            background: activeTool === "export" ? COLORS.accentSoft : COLORS.surface,
            border: `1px solid ${activeTool === "export" ? COLORS.accentDark : COLORS.rule}`,
            fontFamily: jakarta,
            fontWeight: 700,
            fontSize: 13,
            boxShadow: activeTool === "export" ? "0 0 0 5px rgba(73, 215, 122, 0.17)" : "none",
          }}
        >
          <Download size={17} />
          Export
          <ChevronDown size={14} />
        </div>
      </div>
      <div
        style={{
          height: 52,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.rule}`,
        }}
      >
        <div style={{ position: "absolute", left: 143, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ fontFamily: jakarta, fontSize: 11, color: COLORS.muted }}>sample-invoice.pdf</span>
          <strong style={{ fontFamily: jakarta, fontSize: 11, color: COLORS.ink }}>Page 1</strong>
          <span style={{ fontFamily: jakarta, fontSize: 10, color: COLORS.muted }}>Local-only autosave</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            border: `1px solid ${COLORS.rule}`,
            borderRadius: 8,
            padding: 4,
            background: COLORS.paper,
          }}
        >
          <CompactButton icon={Undo2} />
          <CompactButton icon={Redo2} />
          <CompactButton icon={Search} />
          <CompactButton icon={FilePlus} active={addingPage} />
          <CompactButton icon={FileMinus} active={removingPage} />
          <CompactButton icon={ZoomOut} />
          <span
            style={{
              width: 48,
              textAlign: "center",
              fontFamily: jakarta,
              fontSize: 10,
              color: COLORS.ink2,
            }}
          >
            118%
          </span>
          <CompactButton icon={ZoomIn} />
          <CompactButton icon={RotateCw} />
          <CompactButton icon={FileDown} />
        </div>
      </div>
    </>
  );
}

function PageRail() {
  const frame = useCurrentFrame();
  const addProgress = interpolate(frame, [825, 850], [0, 1], clamp);
  const removeProgress = interpolate(frame, [880, 910], [0, 1], clamp);
  const pageFourVisibility = Math.max(0, Math.min(addProgress, 1 - removeProgress));
  const pageCount = pageFourVisibility > 0.5 ? 4 : 3;

  return (
    <div
      style={{
        width: 126,
        flexShrink: 0,
        background: COLORS.surface,
        borderRight: `1px solid ${COLORS.rule}`,
        padding: "15px 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 14,
          fontFamily: jakarta,
          fontSize: 10,
          fontWeight: 700,
          color: COLORS.ink2,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        <span>Pages</span>
        <span>{pageCount}</span>
      </div>
      {[1, 2, 3].map((page) => (
        <div key={page} style={{ marginBottom: 12 }}>
          <div
            style={{
              height: 126,
              padding: 6,
              borderRadius: 7,
              border: `1px solid ${page === 1 ? COLORS.accentDark : COLORS.rule}`,
              background: page === 1 ? COLORS.accentSoft : COLORS.white,
            }}
          >
            <Img
              src={staticFile("assets/sample-invoice-page.png")}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: page === 1 ? "top" : "center",
              }}
            />
          </div>
          <div
            style={{
              textAlign: "center",
              fontFamily: jakarta,
              fontSize: 9,
              color: page === 1 ? COLORS.accentDark : COLORS.muted,
              marginTop: 4,
            }}
          >
            {page}
          </div>
        </div>
      ))}
      {pageFourVisibility > 0 ? (
        <div
          style={{
            height: 146 * pageFourVisibility,
            marginBottom: 12,
            opacity: pageFourVisibility,
            overflow: "hidden",
            transform: `translateY(${(1 - pageFourVisibility) * -12}px)`,
          }}
        >
          <div
            style={{
              height: 126,
              borderRadius: 7,
              border: `1px solid ${COLORS.accentDark}`,
              background: COLORS.white,
              display: "grid",
              placeItems: "center",
              color: COLORS.accentDark,
              boxShadow: "0 0 0 3px rgba(73, 215, 122, 0.12)",
            }}
          >
            <FilePlus size={24} strokeWidth={1.7} />
          </div>
          <div
            style={{
              textAlign: "center",
              fontFamily: jakarta,
              fontSize: 9,
              fontWeight: 700,
              color: COLORS.accentDark,
              marginTop: 4,
            }}
          >
            4 · new
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div
        style={{
          fontFamily: jakarta,
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.muted,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          minHeight: 34,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          borderRadius: 6,
          border: `1px solid ${COLORS.rule}`,
          background: COLORS.surface,
          fontFamily: jakarta,
          fontSize: 11,
          fontWeight: 600,
          color: COLORS.ink,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ExportGrid() {
  const items = [
    ["PDF", FileText],
    ["TXT", FileText],
    ["CSV", FileSpreadsheet],
    ["XLSX", FileSpreadsheet],
  ] as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map(([label, IconComponent]) => (
        <div
          key={label}
          style={{
            height: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            borderRadius: 6,
            border: `1px solid ${label === "PDF" ? COLORS.accentDark : COLORS.rule}`,
            background: label === "PDF" ? COLORS.accentSoft : COLORS.surface,
            color: label === "PDF" ? COLORS.accentDark : COLORS.ink,
            fontFamily: jakarta,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          <IconComponent size={15} /> {label}
        </div>
      ))}
    </div>
  );
}

function Inspector({ activeTool }: { activeTool: ToolId }) {
  const frame = useCurrentFrame();
  const isPageScene = frame >= 810 && frame < 930;
  const pageAddProgress = interpolate(frame, [825, 850], [0, 1], clamp);
  const pageRemoveProgress = interpolate(frame, [880, 910], [0, 1], clamp);
  const pageCount = Math.min(pageAddProgress, 1 - pageRemoveProgress) > 0.5 ? 4 : 3;
  let title = "Document";
  let content = (
    <>
      <Field label="File" value="sample-invoice.pdf" />
      <Field label="Pages" value="3 pages" />
      <div
        style={{
          padding: 12,
          borderRadius: 7,
          background: COLORS.accentWash,
          color: COLORS.accentDark,
          fontFamily: jakarta,
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1.5,
        }}
      >
        Autosaved locally · never uploaded
      </div>
    </>
  );

  if (isPageScene) {
    title = "Page manager";
    content = (
      <>
        <Field label="Document" value={`${pageCount} pages`} />
        <Field label="Action" value={frame < 870 ? "Add blank page" : "Remove page 4"} />
        <div
          style={{
            padding: 12,
            borderRadius: 7,
            background: COLORS.accentWash,
            color: COLORS.accentDark,
            fontFamily: jakarta,
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          Page changes stay in local edit history
        </div>
      </>
    );
  } else if (activeTool === "text") {
    title = "Text replacement";
    content = (
      <>
        <Field label="Replace with" value="Northstar Studio" />
        <Field label="Font match" value="Helvetica · 12 pt" />
        <div
          style={{
            padding: 12,
            borderRadius: 7,
            background: COLORS.accentWash,
            color: COLORS.accentDark,
            fontFamily: jakarta,
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          Closest document font applied
        </div>
      </>
    );
  } else if (activeTool === "links") {
    title = "Link";
    content = (
      <>
        <Field label="Text" value="View payment terms" />
        <Field label="Destination" value="https://acme.example/terms" />
        <Field label="Target" value="Open in a new tab" />
      </>
    );
  } else if (activeTool === "forms") {
    title = "Form field";
    content = (
      <>
        <Field label="Type" value="Text field" />
        <Field label="Name" value="Approved by" />
        <Field label="Required" value="Yes" />
      </>
    );
  } else if (activeTool === "whiteout") {
    title = "Whiteout";
    content = (
      <>
        <Field label="Area" value="Invoice date" />
        <Field label="Fill" value="Paper white" />
        <div style={{ height: 14, borderRadius: 999, background: COLORS.white, border: `1px solid ${COLORS.rule}` }} />
      </>
    );
  } else if (activeTool === "sign") {
    title = "Signature";
    content = (
      <>
        <Field label="Mode" value="Drawn ink" />
        <Field label="Ink" value="Forest green · 86%" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 12,
            borderRadius: 7,
            background: COLORS.accentWash,
            color: COLORS.accentDark,
            fontFamily: jakarta,
            fontWeight: 700,
            fontSize: 10,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.accentDark }} />
          Stored only in this browser
        </div>
      </>
    );
  } else if (activeTool === "annotate" || activeTool === "shapes") {
    title = activeTool === "annotate" ? "Highlight" : "Shape";
    content = (
      <>
        <Field label="Style" value={activeTool === "annotate" ? "Marker · yellow" : "Rounded rectangle"} />
        <Field label="Opacity" value={activeTool === "annotate" ? "58%" : "100%"} />
        <div
          style={{
            height: 12,
            borderRadius: 999,
            background: activeTool === "annotate" ? "#ffdd44" : COLORS.accentDark,
          }}
        />
      </>
    );
  } else if (activeTool === "apply" || activeTool === "export") {
    title = activeTool === "apply" ? "Ready to apply" : "Export";
    content = (
      <>
        <div
          style={{
            marginBottom: 14,
            padding: 12,
            borderRadius: 7,
            background: COLORS.accentWash,
            fontFamily: jakarta,
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.accentDark,
          }}
        >
          9 local edits · safely autosaved
        </div>
        <ExportGrid />
      </>
    );
  }

  return (
    <div
      style={{
        width: 250,
        flexShrink: 0,
        background: COLORS.surface,
        borderLeft: `1px solid ${COLORS.rule}`,
        padding: "16px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <span
          style={{
            fontFamily: jakarta,
            fontSize: 10,
            fontWeight: 700,
            color: COLORS.muted,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          Inspector
        </span>
        <span style={{ fontFamily: jakarta, fontSize: 11, fontWeight: 700, color: COLORS.ink }}>Page 1</span>
      </div>
      <div
        style={{
          marginBottom: 17,
          padding: "12px 11px",
          borderRadius: 8,
          border: `1px solid ${COLORS.rule}`,
          background: COLORS.paper,
          fontFamily: jakarta,
          fontSize: 13,
          fontWeight: 800,
          color: COLORS.ink,
        }}
      >
        {title}
      </div>
      {content}
    </div>
  );
}

function SignatureStudio({ opacity }: { opacity: number }) {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [715, 760], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 510,
        height: 260,
        transform: `translate(-50%, -48%) scale(${0.96 + opacity * 0.04})`,
        opacity,
        borderRadius: 18,
        background: COLORS.surface,
        border: `1px solid ${COLORS.rule}`,
        boxShadow: "0 30px 90px -28px rgba(28, 35, 27, 0.48)",
        padding: 22,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: jakarta, fontSize: 20, fontWeight: 800, color: COLORS.ink }}>Create signature</div>
          <div style={{ fontFamily: jakarta, fontSize: 11, color: COLORS.muted, marginTop: 3 }}>
            Draw naturally. Reuse locally.
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["Type", "Draw", "Upload"].map((tab) => (
            <div
              key={tab}
              style={{
                padding: "7px 11px",
                borderRadius: 7,
                background: tab === "Draw" ? COLORS.accentSoft : COLORS.paper,
                color: tab === "Draw" ? COLORS.accentDark : COLORS.muted,
                fontFamily: jakarta,
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          height: 128,
          borderRadius: 12,
          background: COLORS.paper,
          border: `1px dashed ${COLORS.rule}`,
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="390" height="95" viewBox="0 0 390 95">
          <path
            d="M18 71 C 67 15, 102 17, 120 58 C 132 84, 151 76, 165 42 C 177 15, 192 21, 198 56 C 204 86, 226 80, 242 47 C 253 25, 270 29, 274 57 C 280 84, 316 78, 370 48"
            fill="none"
            stroke={COLORS.accentDark}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - draw}
          />
        </svg>
      </div>
    </div>
  );
}

export function EditorWorkspace({ activeTool }: { activeTool: ToolId }) {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [8, 52], [0, 1], clamp);
  const studioOpacity = interpolate(frame, [700, 716, 770, 792], [0, 1, 1, 0], clamp);
  return (
    <div
      style={{
        position: "absolute",
        inset: 20,
        borderRadius: 18,
        overflow: "hidden",
        background: COLORS.paper,
        border: `1px solid ${COLORS.rule}`,
        boxShadow: "0 28px 90px -38px rgba(33, 40, 30, 0.55)",
        transform: `scale(${0.97 + enter * 0.03})`,
        opacity: enter,
      }}
    >
      <Header activeTool={activeTool} />
      <div style={{ display: "flex", height: "calc(100% - 143px)" }}>
        <PageRail />
        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: COLORS.paper,
            backgroundImage:
              "linear-gradient(rgba(120, 109, 69, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 109, 69, 0.12) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            overflow: "hidden",
          }}
        >
          <PdfDocument />
          {studioOpacity > 0 ? <SignatureStudio opacity={studioOpacity} /> : null}
        </div>
        <Inspector activeTool={activeTool} />
      </div>
    </div>
  );
}
