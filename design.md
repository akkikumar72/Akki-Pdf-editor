# Akkivo visual system

## Direction

Hallmark's **Newsprint** theme, adapted for a working PDF editor. Salmon paper, warm ink, burgundy actions, a dark navigation rail, and Playfair Display headings give the document workspace a recognizable editorial identity.

The layout family is **Workbench**, retaining the functional sidebar and canvas. The home screen uses a ruled document-desk composition with an import action, a typographic paper illustration, and a recent-document index. The footer is a single ruled line. Theme changes must preserve the routes, editing controls, and local-document behavior.

## Source of truth

- `tokens.css`: active palette, type pairing, navigation colors, and logo colors.
- `src/styles/tokens.css`: base spacing, type sizes, motion, semantic status colors, PDF selection chrome, and font imports.
- `src/styles/studio.css`: home and editor presentation.
- `src/styles/pricing.css`: supporting pricing screens, consuming the same palette.
- `public/favicon.svg`: the existing folded mark in the theme's sRGB equivalents.

The root theme sheet is loaded after the base tokens and before component styles. New theme colors belong in the root token file. Use the existing named tokens in components.

## Typography

- Display and wordmark: Playfair Display, 500 to 700. Italics are reserved for short emphasis.
- Body and controls: Geist, 400 to 700. Keep dense tool labels in sans serif.
- Metadata and keyboard shortcuts: Geist Mono.
- Handwriting font choices remain available inside the signature tool. They are document content, not interface typography.

## Composition and interaction

- Use warm paper for the surrounding workspace and preserve the original PDF page colors.
- Use dark ink for the navigation rail, with a light selected state.
- Keep burgundy for primary actions, selected controls, focus, and short typographic emphasis.
- Prefer fine rules and small corner radii. Avoid rounded green cards and decorative gradients.
- Keep buttons and navigation labels on one line. Let surrounding groups wrap.
- Retain import loading/error states, disabled controls, keyboard focus, and all editing gestures.
- Use existing named spacing and easing tokens when extending the design. Keep motion functional and honor reduced-motion preferences.
- At small widths, collapse the editor sidebar into its existing drawer. Validate at 320, 375, 414, and 768 pixels.

## Verified contrast

WCAG relative-luminance ratios computed from the active OKLCH palette:

| Pair                               | Ratio  |
| ---------------------------------- | ------ |
| Muted text on paper                | 5.51:1 |
| Muted text on surface              | 6.24:1 |
| Primary button text on burgundy    | 9.18:1 |
| Muted navigation text on dark rail | 7.78:1 |
| Selected tool text on accent tint  | 6.69:1 |
| Focus outline on surface           | 7.90:1 |

These are palette checks. Browser layout and focus visibility still require visual review.
