# Pixi

Drop in an image and Pixi pulls a seven-color palette out of it, as a card you can name, drag around and export. Everything runs in the browser; nothing is uploaded.

No build step and no dependencies: plain ES modules. To run it locally:

    python3 -m http.server

then open http://localhost:8000.

## Using it

- Drop an image on the blank card, or tap it to choose one. The card grows to fill the screen, the image turns to bloxels, scanners hunt the seven colors, and the finished card settles into the strip.
- Type a name on the card. Click a chip to copy its hex.
- Tap the export icon under a card for a PNG of the card. Hold it until it bursts for a zip of palette files: GIMP, Aseprite, Lospec, Paint.NET, Adobe (ASE, ACO, ACT), Unity, SVG, CSS and JSON, plus a one-pixel-per-color PNG.
- Wheel, arrow keys or a swipe move between cards. Drag a card (long-press on touch) to reorder it. The icon above a card deletes it.

## Checks

    node test/check.mjs
