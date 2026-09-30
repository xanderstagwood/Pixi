import { hexToRgb, hexToHsl } from '../color.js';

// Pure encoders: hex array (coolest first) in, text or bytes out. No DOM, so they run under node.

const rgb = (hex) => { const { r, g, b } = hexToRgb(hex); return `${r} ${g} ${b}`; };
const bare = (hex) => hex.slice(1);

const u16 = (n) => new Uint8Array([n >> 8, n & 255]);
const u32 = (n) => new Uint8Array([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const f32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, n); return b; };
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
// UTF-16BE with the terminating null that ASE and ACO both require.
const utf16 = (s) => {
  const b = new Uint8Array((s.length + 1) * 2);
  for (let i = 0; i < s.length; i++) { b[i * 2] = s.charCodeAt(i) >> 8; b[i * 2 + 1] = s.charCodeAt(i) & 255; }
  return b;
};
const cat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

/** CSS custom properties. */
export const css = (colors) => `:root {\n${colors.map((c, i) => `  --color-${i + 1}: ${c};\n`).join('')}}\n`;

/** Design-token JSON with hex, RGB and HSL per color. */
export function json(name, colors) {
  const entries = colors.map((hex) => {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = hexToHsl(hex);
    return { hex, rgb: { r, g, b }, hsl: { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) } };
  });
  return JSON.stringify({ name, colors: entries }, null, 2) + '\n';
}

/** GIMP / Inkscape / Krita / Aseprite `.gpl`. */
export const gpl = (name, colors) =>
  `GIMP Palette\nName: ${name}\nColumns: 0\n#\n${colors.map((c) => `${rgb(c)}\t${bare(c)}\n`).join('')}`;

/** Lospec `.hex`: bare lowercase codes, one per line. */
export const hex = (colors) => colors.map((c) => `${bare(c).toLowerCase()}\n`).join('');

/** JASC `.pal` (Paint Shop Pro, Aseprite, GraphicsGale). CRLF is part of the format. */
export const pal = (colors) => `JASC-PAL\r\n0100\r\n${colors.length}\r\n${colors.map((c) => `${rgb(c)}\r\n`).join('')}`;

/** Paint.NET `.txt`: AARRGGBB per line. */
export const paintNet = (colors) => `;paint.net Palette File\n${colors.map((c) => `FF${bare(c)}\n`).join('')}`;

/** SVG swatch strip; opens in Inkscape, Illustrator, Figma and Affinity. */
export const svg = (colors, cell = 64) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${colors.length * cell}" height="${cell}" viewBox="0 0 ${colors.length * cell} ${cell}">\n` +
  colors.map((c, i) => `  <rect x="${i * cell}" width="${cell}" height="${cell}" fill="${c}"><title>${c}</title></rect>\n`).join('') +
  '</svg>\n';

/** Unity color preset library; drop in an Assets/Editor folder. */
export const unityColors = (colors) => {
  const f = (v) => +(v / 255).toFixed(4);
  return [
    '%YAML 1.1', '%TAG !u! tag:unity3d.com,2011:', '--- !u!114 &1', 'MonoBehaviour:',
    '  m_ObjectHideFlags: 52', '  m_CorrespondingSourceObject: {fileID: 0}', '  m_PrefabInstance: {fileID: 0}',
    '  m_PrefabAsset: {fileID: 0}', '  m_GameObject: {fileID: 0}', '  m_Enabled: 1', '  m_EditorHideFlags: 1',
    '  m_Script: {fileID: 12323, guid: 0000000000000000e000000000000000, type: 0}',
    '  m_Name: ', '  m_EditorClassIdentifier: ', '  m_Presets:',
    ...colors.flatMap((c) => {
      const { r, g, b } = hexToRgb(c);
      return ['  - m_Name: ', `    m_Color: {r: ${f(r)}, g: ${f(g)}, b: ${f(b)}, a: 1}`];
    }),
    '',
  ].join('\n');
};

/** Adobe Swatch Exchange: Photoshop, Illustrator, InDesign, Affinity. */
export function ase(colors) {
  const blocks = colors.map((c) => {
    const { r, g, b } = hexToRgb(c);
    const name = utf16(bare(c));
    const body = cat([u16(name.length / 2), name, ascii('RGB '), f32(r / 255), f32(g / 255), f32(b / 255), u16(2)]);
    return cat([u16(1), u32(body.length), body]);
  });
  return cat([ascii('ASEF'), u16(1), u16(0), u32(colors.length), ...blocks]);
}

/** Photoshop `.aco` swatches. v1 block for old readers, then v2 with names. */
export function aco(colors) {
  const chan = (c) => { const { r, g, b } = hexToRgb(c); return [u16(0), u16(r * 257), u16(g * 257), u16(b * 257), u16(0)]; };
  const v1 = colors.flatMap(chan);
  const v2 = colors.flatMap((c) => { const name = utf16(bare(c)); return [...chan(c), u32(name.length / 2), name]; });
  return cat([u16(1), u16(colors.length), ...v1, u16(2), u16(colors.length), ...v2]);
}

/** Photoshop `.act` color table: 256 slots, then the used count and no transparency. */
export function act(colors) {
  const table = new Uint8Array(772);
  colors.slice(0, 256).forEach((c, i) => { const { r, g, b } = hexToRgb(c); table.set([r, g, b], i * 3); });
  table.set([...u16(Math.min(colors.length, 256)), 0xff, 0xff], 768);
  return table;
}
