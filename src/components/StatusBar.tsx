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

export function StatusBar({
  documentName,
  isBusy,
  operationCount,
  pageIndex,
  pageCount,
  scale,
  status,
}: StatusBarProps) {
  return (
    <div className="flex h-9 items-center gap-4 px-4 text-muted-foreground text-xs">
      <span className="flex items-center gap-1.5 font-medium text-foreground [&_svg]:size-3.5 [&_svg]:text-primary">
        {isBusy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ShieldCheck aria-hidden="true" />}
        {status}
      </span>
      <span className="ml-auto">{documentName ?? "No document"}</span>
      <span>{pageCount ? `Page ${pageIndex + 1}/${pageCount}` : "Page -"}</span>
      <span>{operationCount} edits</span>
      <span className="tabular-nums">{Math.round(scale * 100)}%</span>
    </div>
  );
}
