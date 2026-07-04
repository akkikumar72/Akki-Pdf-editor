import { IconLoader, IconShieldCheck } from "./AppIcons";

type StatusBarProps = {
  documentName?: string;
  isBusy: boolean;
  /** How many operations a live group drag is moving (0 when idle). */
  movingCount?: number;
  operationCount: number;
  pageIndex: number;
  pageCount: number;
  scale: number;
  /** How many operations are currently selected. */
  selectedCount?: number;
  status: string;
};

export function StatusBar({
  documentName,
  isBusy,
  movingCount = 0,
  operationCount,
  pageIndex,
  pageCount,
  scale,
  selectedCount = 0,
  status,
}: StatusBarProps) {
  // Sejda-parity readouts take over the message slot while a multi-selection
  // exists (and while it is being dragged); the regular status returns after.
  const message = movingCount > 1
    ? `Moving ${movingCount} objects`
    : selectedCount > 1
      ? `Selected ${selectedCount} objects`
      : status;
  return (
    <div className="status-bar">
      <span className="status-bar__message">
        {isBusy ? <IconLoader aria-hidden="true" className="spin" /> : <IconShieldCheck aria-hidden="true" />}
        {message}
      </span>
      <span>{documentName ?? "No document"}</span>
      <span>{pageCount ? `Page ${pageIndex + 1}/${pageCount}` : "Page -"}</span>
      <span>{operationCount} edits</span>
      <span>{Math.round(scale * 100)}%</span>
    </div>
  );
}
