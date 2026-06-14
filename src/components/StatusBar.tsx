import { Loader2, ShieldCheck } from "lucide-react";

type StatusBarProps = {
  documentName?: string;
  isBusy: boolean;
  operationCount: number;
  pageIndex: number;
  pageCount: number;
  scale: number;
  status: string;
};

export function StatusBar({ documentName, isBusy, operationCount, pageIndex, pageCount, scale, status }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span className="status-bar__message">
        {isBusy ? <Loader2 aria-hidden="true" className="spin" /> : <ShieldCheck aria-hidden="true" />}
        {status}
      </span>
      <span>{documentName ?? "No document"}</span>
      <span>{pageCount ? `Page ${pageIndex + 1}/${pageCount}` : "Page -"}</span>
      <span>{operationCount} edits</span>
      <span>{Math.round(scale * 100)}%</span>
    </div>
  );
}
