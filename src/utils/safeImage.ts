/**
 * Security invariant: `<img>` overlays only ever render data:image/(png|jpeg)
 * sources. Anything else (remote URLs, SVG data URLs, spoofed headers) is
 * dropped at render time.
 */
export function safeImageSrc(src: string | undefined): string | undefined {
  return src && /^data:image\/(png|jpeg|jpg);base64,/i.test(src) ? src : undefined;
}
