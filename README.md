# Pixi

Drop in an image and Pixi pulls a seven-color palette out of it, as a card you can name, drag around and export. Everything runs in the browser; nothing is uploaded.

No build step and no dependencies: plain ES modules. To run it locally:

    python3 -m http.server

then open http://localhost:8000.

## Using it

- Drop an image on the blank card, or tap it to choose one. Drop or choose several at once (up to five) and they are analysed one after another, with a counter in the corner. The card grows to fill the screen, the image turns to bloxels, scanners hunt the seven colors, and the finished card settles into the strip.
- Type a name on the card. Click a chip to copy its hex.
- Tap the export icon under a card for a PNG of the card. Hold it until it bursts for a zip of palette files: GIMP, Aseprite, Lospec, Paint.NET, Adobe (ASE, ACO, ACT), Unity, SVG, CSS and JSON, plus a one-pixel-per-color PNG.
- Wheel, arrow keys or a swipe move between cards. Drag a card (long-press on touch) to reorder it. The icon above a card deletes it.

## How the colors are chosen

- **Extraction** (`src/extract.js`): pixels are binned into a histogram, weighted for the eye (a small vivid patch counts for more than its area), and clustered in OKLab with weighted k-means started from k-means++ seeds. Twenty-four candidates are cut down to seven by farthest-point sampling weighted by coverage and vividness, with a bonus for reaching both the dark and the light end.
- **Ordering** (`src/arrange.js`, `src/perceive.js`): every color is judged as a person would judge it, for warmth (an orange-red to greenish-blue axis, lighter reads warmer) and lightness (saturated colors look lighter, the Helmholtz-Kohlrausch effect). Each palette then gets one temperature pattern (warm to cool, or cool to warm) and one shade pattern (dark to light, light to dark, dark-light-dark, or light-dark-light), and the order that fits both best is found by trying every order.
- **Variations** (`src/color.js`, `decide` in `src/arrange.js`): each color has five subtle OKLCH variations, and the ones that make the finished order fit its patterns best are kept.

## Checks

    node test/check.mjs
