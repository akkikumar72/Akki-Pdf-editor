import type { SVGProps } from "react";
import {
  IconArrowLeft,
  IconArrowRight,
  IconFileSearch,
  IconHighlighter,
  IconOrganize,
  IconPdfEdit,
  IconSend,
  IconShieldCheck,
  IconSignature,
  IconTrash,
  IconUpload,
} from "./AppIcons";

type LumenIconProps = SVGProps<SVGSVGElement>;

export function LumenCloudIcon(props: LumenIconProps) {
  return <IconUpload {...props} />;
}

export function LumenArrowLeftIcon(props: LumenIconProps) {
  return <IconArrowLeft {...props} />;
}

export function LumenArrowRightIcon(props: LumenIconProps) {
  return <IconArrowRight {...props} />;
}

export function LumenSearchIcon(props: LumenIconProps) {
  return <IconFileSearch {...props} />;
}

export function LumenMagicIcon(props: LumenIconProps) {
  return <IconHighlighter {...props} />;
}

export function LumenBrainIcon(props: LumenIconProps) {
  return <IconOrganize {...props} />;
}

export function LumenDocumentEditIcon(props: LumenIconProps) {
  return <IconPdfEdit {...props} />;
}

export function LumenSendIcon(props: LumenIconProps) {
  return <IconSend {...props} />;
}

export function LumenShieldNetworkIcon(props: LumenIconProps) {
  return <IconShieldCheck {...props} />;
}

export function LumenBranchIcon(props: LumenIconProps) {
  return <IconSignature {...props} />;
}

export function LumenTrashIcon(props: LumenIconProps) {
  return <IconTrash {...props} />;
}

export function LumenUploadIcon(props: LumenIconProps) {
  return <IconUpload {...props} />;
}
