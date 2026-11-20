// Tiny 3×5 pixel font, drawn with fillRect so it stays crisp at any scale.
const G: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  '+': '000010111010000', '-': '000000111000000', '.': '000000000000010', '!': '010010010000010', '%': '101001010100101',
  'x': '000101010101000', ' ': '000000000000000',
};

export function textWidth(s: string, scale = 1) { return (s.length * 4 - 1) * scale; }

export function drawText(
  g: CanvasRenderingContext2D, s: string, x: number, y: number, color: string,
  o: { scale?: number; align?: 'left' | 'center'; shadow?: string | null; alpha?: number } = {},
) {
  const sc = o.scale ?? 1;
  const str = s.replace(/[a-wyz]/g, c => c.toUpperCase());
  let cx = Math.round(o.align === 'left' ? x : x - textWidth(str, sc) / 2);
  const cy = Math.round(y);
  const prev = g.globalAlpha;
  if (o.alpha != null) g.globalAlpha = o.alpha;
  for (const ch of str) {
    const f = G[ch];
    if (f) {
      for (let i = 0; i < 15; i++) {
        if (f[i] !== '1') continue;
        const px = cx + (i % 3) * sc, py = cy + ((i / 3) | 0) * sc;
        if (o.shadow !== null) { g.fillStyle = o.shadow ?? '#000'; g.fillRect(px + sc, py + sc, sc, sc); }
        g.fillStyle = color; g.fillRect(px, py, sc, sc);
      }
    }
    cx += 4 * sc;
  }
  g.globalAlpha = prev;
}

export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : String(Math.floor(n));
  const u = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let i = -1;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : String(Math.floor(n))) + u[i];
}
