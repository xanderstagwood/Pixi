import * as f from './formats.js';
import { zip } from './zip.js';

const utf8 = new TextEncoder();
const text = (s) => utf8.encode(s);

const README = `PALETTE EXPORT

palette.gpl            GIMP, Inkscape, Krita, Aseprite (Palette > Load)
palette.pal            Aseprite, Paint Shop Pro, GraphicsGale (JASC)
palette.hex            Lospec, Pixelorama, Aseprite (one hex code per line)
palette.txt            Paint.NET (Colors window > Palette > Load)
palette.ase            Photoshop, Illustrator, InDesign, Affinity (Swatch Exchange)
palette.aco            Photoshop swatches (Swatches panel > Load Swatches)
palette.act            Photoshop color table, also Indexed Color mode
palette.colors         Unity: copy into an Assets/Editor folder, then Color picker > presets
palette.svg            Figma, Illustrator, Inkscape swatch strip
palette.css            CSS custom properties
palette.json           Design tokens with hex, RGB and HSL
palette-1px.png        One pixel per color. GameMaker, Aseprite, Pyxel Edit, Godot,
                       Lospec: load it as an image and read the pixels as the palette
palette-card.png       The finished card

Colors run in the card's stack order, bottom to top: cool to warm, with light and dark ordered to suit the image.
`;

const canvasBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'));
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

function strip(colors) {
  const c = Object.assign(document.createElement('canvas'), { width: colors.length, height: 1 });
  const g = c.getContext('2d');
  colors.forEach((hex, i) => { g.fillStyle = hex; g.fillRect(i, 0, 1, 1); });
  return c;
}

/**
 * Builds the multi-format export archive for one palette.
 * @param {{name: string, colors: string[]}} palette colors in stack order, bottom row first
 * @param {Blob} card the rendered card PNG
 * @returns {Promise<Blob>}
 */
export async function buildZip({ name, colors }, card) {
  const files = [
    ['palette.gpl', text(f.gpl(name, colors))],
    ['palette.pal', text(f.pal(colors))],
    ['palette.hex', text(f.hex(colors))],
    ['palette.txt', text(f.paintNet(colors))],
    ['palette.ase', f.ase(colors)],
    ['palette.aco', f.aco(colors)],
    ['palette.act', f.act(colors)],
    ['palette.colors', text(f.unityColors(colors))],
    ['palette.svg', text(f.svg(colors))],
    ['palette.css', text(f.css(colors))],
    ['palette.json', text(f.json(name, colors))],
    ['palette-1px.png', await bytes(await canvasBlob(strip(colors)))],
    ['palette-card.png', await bytes(card)],
    ['README.txt', text(README)],
  ];
  return zip(files.map(([n, data]) => ({ name: `${name}/${n}`, data })));
}
