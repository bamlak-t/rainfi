import { BS, CHEST_PAL, COLS, H, ROWS, TIERS, TOP, W } from './config';
import { drawText, fmt } from './font';
import type { Block, Game, GameEvent, Pt } from './game';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (n: number) => Math.floor(Math.random() * n);

interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; c: string; s: number; grav: number }
interface Chunk { x: number; y: number; vx: number; vy: number; img: HTMLCanvasElement; sx: number; sy: number; w: number; life: number; delay: number; bounces: number }
interface Mote { x: number; y: number; vx: number; vy: number; delay: number; t: number; c: string }
interface Txt { x: number; y: number; s: string; c: string; life: number; max: number; scale: number; vy: number; v?: number; age: number }
interface Ring { x: number; y: number; r: number; dr: number; life: number; max: number; c: string }
interface Impact { x: number; y: number; life: number }
interface Bolt { paths: Pt[][]; life: number; max: number }
interface Sweep { y: number; life: number }

const BULBS = ['#ffcf7a', '#ff8fa3', '#9ff0c9', '#8fc8ff'];
const MOTE_TARGET: Pt = [6, 4];

// ---------- block art ----------
const crackCache = new Map<number, Pt[]>();
function crackPixels(seed: number): Pt[] {
  let c = crackCache.get(seed);
  if (c) return c;
  let s = seed;
  const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pts: Pt[] = [];
  const walk = (x: number, y: number, n: number, dx: number, dy: number) => {
    for (let i = 0; i < n; i++) {
      pts.push([x, y]);
      if (R() < 0.65) { y += dy; x += dx; } else x += R() < 0.5 ? -1 : 1;
      x = Math.max(1, Math.min(14, x)); y = Math.max(1, Math.min(14, y));
    }
    return [x, y] as Pt;
  };
  const [mx, my] = walk(3 + Math.floor(R() * 9), 1, 9, 0, 1);
  walk(mx, my, 7, R() < 0.5 ? 1 : -1, 1);
  walk(1, 4 + Math.floor(R() * 7), 7, 1, 0);
  walk(14, 3 + Math.floor(R() * 9), 6, -1, 0);
  crackCache.set(seed, pts);
  return pts;
}

export function drawBlock(g: CanvasRenderingContext2D, b: Block, x: number, y: number, t: number, detail = true) {
  const T = b.t >= 0 ? TIERS[b.t] : null;
  const [base, lt, dk, ac] = T ? T.pal : CHEST_PAL;
  const P = (a: number, c: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect((x + a) | 0, (y + c) | 0, w, h); };
  P(0, 0, 16, 16, base);
  P(0, 0, 16, 1, lt); P(0, 0, 1, 16, lt); P(0, 15, 16, 1, dk); P(15, 0, 1, 16, dk);
  let s = b.seed;
  const R = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const k = T ? T.key : 'chest';
  switch (k) {
    case 'dirt': for (let i = 0; i < 7; i++) P(2 + R() * 12, 2 + R() * 12, 1 + +(i % 3 === 0), 1, i % 2 ? dk : ac); break;
    case 'clay': P(1, 5, 10, 1, dk); P(5, 11, 10, 1, dk); P(1, 6, 9, 1, lt); for (let i = 0; i < 3; i++) P(2 + R() * 12, 2 + R() * 12, 1, 1, ac); break;
    case 'stone': for (let i = 0; i < 3; i++) { const a = 2 + R() * 10, c = 2 + R() * 11; P(a, c, 3, 1, lt); P(a, c + 1, 3, 1, dk); } break;
    case 'iron': for (const [a, c] of [[3, 3], [12, 3], [3, 12], [12, 12]]) { P(a, c, 1, 1, lt); P(a + 1, c + 1, 1, 1, dk); } for (let i = 0; i < 4; i++) P(3 + R() * 10, 3 + R() * 10, 1 + (i % 2), 1, ac); break;
    case 'crystal': { const a = 3 + ((R() * 6) | 0); for (let i = 0; i < 6; i++) { P(a + i, 11 - i, 1, 1, ac); P(a + i + 1, 11 - i, 1, 1, lt); } if (Math.sin(t * 3 + b.seed) > 0.6) P(11, 4, 1, 1, '#fff'); break; }
    case 'ruins': P(4, 4, 8, 1, dk); P(4, 4, 1, 8, dk); P(4, 11, 8, 1, dk); P(11, 7, 1, 5, dk); P(7, 7, 3, 1, dk); P(8, 8, 1, 1, ac); break;
    case 'obsidian': P(2, 2, 1, 1, lt); P(3, 3, 1, 1, lt); P(4, 4, 1, 1, lt); P(10, 9, 4, 1, lt); for (let i = 0; i < 3; i++) P(3 + R() * 10, 3 + R() * 10, 1, 1, ac); break;
    case 'fossil': { const a = 3 + ((R() * 4) | 0), c = 5 + ((R() * 5) | 0); P(a, c, 7, 1, ac); P(a - 1, c - 1, 2, 1, ac); P(a - 1, c + 1, 2, 1, ac); P(a + 6, c - 1, 2, 1, ac); P(a + 6, c + 1, 2, 1, ac); P(10, 3, 2, 2, dk); break; }
    case 'magma': { g.globalAlpha = 0.55 + 0.45 * Math.sin(t * 2.5 + b.seed); P(2, 9, 5, 1, ac); P(6, 8, 4, 1, ac); P(9, 7, 1, 3, ac); P(11, 3, 1, 4, ac); P(4, 3, 3, 1, ac); g.globalAlpha = 1; break; }
    case 'star': for (let i = 0; i < 5; i++) { const a = 2 + R() * 12, c = 2 + R() * 12; if (Math.sin(t * 4 + i * 2 + b.seed) > 0) P(a, c, 1, 1, ac); else P(a, c, 1, 1, lt); } break;
    case 'core': { const p = Math.sin(t * 2 + b.seed) * 0.5 + 0.5; g.globalAlpha = 0.35 + 0.5 * p; P(5, 5, 6, 6, ac); g.globalAlpha = 1; P(7, 7, 2, 2, '#fff'); break; }
    case 'chest': P(1, 6, 14, 3, ac); P(7, 5, 2, 5, '#2a1a0e'); P(7, 7, 2, 1, ac); P(2, 2, 12, 1, lt); if (Math.sin(t * 5 + b.seed) > 0.85) P(12, 3, 1, 1, '#fff'); break;
  }
  if (!detail) return;
  const dmg = 1 - b.hp / b.max;
  if (dmg > 0.04) {
    const cr = crackPixels(b.seed), n = Math.min(cr.length, Math.floor(dmg * cr.length * 1.15));
    for (let i = 0; i < n; i++) { const [a, c] = cr[i]; P(a, c, 1, 1, 'rgba(0,0,0,0.6)'); if (i % 2 === 0) P(a + 1, c + 1, 1, 1, 'rgba(255,255,255,0.12)'); }
  }
  if (b.ct > 0) { g.globalAlpha = 0.75; for (let i = 0; i < 5; i++) P(1 + Math.random() * 14, 1 + Math.random() * 14, 1, 1, '#8cff5a'); g.globalAlpha = 1; }
  if (b.flash > 0) P(0, 0, 16, 16, 'rgba(255,255,255,0.5)');
}

function blockSprite(b: Block, t: number) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d')!;
  drawBlock(g, { ...b, hp: b.max * 0.25, flash: 0, ct: 0 }, 0, 0, t);
  return c;
}

// ---------- renderer ----------
export class Renderer {
  g: CanvasRenderingContext2D;
  t = 0;
  shake = 0;
  flash = 0;
  flashColor = '235,235,255';
  parts: Part[] = [];
  chunks: Chunk[] = [];
  motes: Mote[] = [];
  texts: Txt[] = [];
  rings: Ring[] = [];
  impacts: Impact[] = [];
  bolts: Bolt[] = [];
  sweeps: Sweep[] = [];
  comboPulse = 0;
  onMote: () => void = () => {};
  private bg: HTMLCanvasElement;
  private roof: HTMLCanvasElement;
  private windows: { x: number; y: number; c: string; on: boolean }[] = [];
  private streaks = Array.from({ length: 90 }, () => ({ x: rnd(0, W), y: rnd(0, H), l: ri(3) + 3, v: rnd(120, 180) }));

  constructor(canvas: HTMLCanvasElement, private game: Game) {
    this.g = canvas.getContext('2d')!;
    this.g.imageSmoothingEnabled = false;
    this.bg = this.paintBg();
    this.roof = this.paintRoof();
    game.on(e => this.onEvent(e));
  }

  private part(x: number, y: number, c: string, n: number, spd = 30, o: Partial<Part> = {}) {
    for (let i = 0; i < n; i++) {
      const life = rnd(0.3, 0.7);
      this.parts.push({ x, y, vx: rnd(-1, 1) * spd, vy: rnd(-1.4, -0.2) * spd, life, max: life, c, s: 1, grav: 160, ...o });
    }
  }
  private text(x: number, y: number, s: string, c: string, scale = 1, life = 1) {
    this.texts.push({ x, y, s, c, life, max: life, scale, vy: -12, age: 0 });
    if (this.texts.length > 16) this.texts.shift();
  }
  /** Loot numbers near each other merge into one counter that keeps ticking up. */
  private loot(x: number, y: number, v: number, c: string, prefix = '+') {
    const t = this.texts.find(t => t.v != null && t.c === c && Math.abs(t.x - x) < 26 && Math.abs(t.y - y) < 14 && t.age < 0.5);
    if (t) { t.v! += v; t.s = prefix + fmt(t.v!); t.life = t.max; t.age = 0; t.vy = -12; return; }
    this.texts.push({ x, y, s: prefix + fmt(v), c, life: 1.1, max: 1.1, scale: 1, vy: -12, v, age: 0 });
    if (this.texts.length > 16) this.texts.shift();
  }

  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'hit': {
        const c = e.acid ? '#9dff6a' : '#a8dcff';
        this.part(e.x + rnd(-3, 3), e.y - 8, c, e.crit ? 6 : 2, 22);
        if (e.crit) {
          this.part(e.x, e.y - 4, '#fff7b0', 8, 45);
          if (this.texts.filter(t => t.c === '#ffe27a').length < 3) this.text(e.x, e.y - 14, fmt(e.dmg) + '!', '#ffe27a', 1, 0.7);
          this.rings.push({ x: e.x, y: e.y - 6, r: 2, dr: 40, life: 0.18, max: 0.18, c: '#fff7b0' });
          this.shake = Math.max(this.shake, 1);
        }
        break;
      }
      case 'break': this.onBreak(e); break;
      case 'rowClear': {
        this.sweeps.push({ y: e.y, life: 0.35 });
        for (let x = 0; x < W; x += 3) this.parts.push({ x, y: e.y + rnd(0, 16), vx: rnd(-10, 10), vy: rnd(-50, -15), life: 0.6, max: 0.6, c: BULBS[ri(4)], s: 1, grav: 60 });
        this.loot(W / 2, e.y - 2, e.bonus, '#9ff0c9', 'ROW +');
        this.shake = Math.max(this.shake, 2.5);
        break;
      }
      case 'lake': this.part(e.x, H - 3, '#8fc8ff', 4, 25); break;
      case 'bolt': {
        const big = e.kind !== 'mini';
        this.bolts.push({ paths: e.paths, life: big ? 0.3 : 0.15, max: big ? 0.3 : 0.15 });
        this.flash = Math.max(this.flash, e.kind === 'player' ? 0.4 : e.kind === 'storm' ? 0.25 : 0.08);
        this.flashColor = '235,235,255';
        const last = e.paths[0][e.paths[0].length - 1];
        this.part(last[0], last[1], '#fff7b0', big ? 12 : 4, 55);
        this.shake = Math.max(this.shake, big ? 2.5 : 1);
        break;
      }
      case 'snail':
        this.part(e.x, e.y, '#ffb38a', 10, 45); this.part(e.x, e.y, '#cfe8a8', 6, 45);
        this.text(e.x, e.y - 6, '+' + fmt(e.loot), '#ffd25a', 1, 1.2);
        this.spawnMotes(e.x, e.y, 4, '#ffd25a');
        break;
      case 'prestige':
        this.flash = 1; this.flashColor = '255,244,214';
        this.text(W / 2, 66, 'CLEAR SKIES', '#ffcf7a', 2, 2.5);
        this.text(W / 2, 80, '+' + e.shards + ' SHARDS', '#9fd3ff', 1, 2.5);
        this.parts = []; this.chunks = [];
        break;
    }
  }

  private onBreak(e: Extract<GameEvent, { type: 'break' }>) {
    const b = e.block, x0 = e.x - 8, y0 = e.y - 8;
    const sprite = blockSprite(b, this.t);
    // impact frame: white silhouette for a beat before the shards fly
    this.impacts.push({ x: x0, y: y0, life: 0.06 });
    if (this.chunks.length > 320) this.chunks.splice(0, 64);
    for (let cy = 0; cy < 16; cy += 4) for (let cx = 0; cx < 16; cx += 4) {
      const dx = cx + 2 - 8, dy = cy + 2 - 8;
      const w = Math.random() < 0.3 ? 2 : 4;
      this.chunks.push({
        x: x0 + cx, y: y0 + cy, vx: dx * rnd(5, 9) + rnd(-12, 12), vy: dy * rnd(2, 5) - rnd(55, 110),
        img: sprite, sx: cx, sy: cy, w, life: rnd(0.8, 1.3), delay: 0.05, bounces: 0,
      });
    }
    const pal = b.t >= 0 ? TIERS[b.t].pal : CHEST_PAL;
    this.part(e.x, e.y, 'rgba(200,190,220,0.6)', 8, 25, { grav: -20 });
    this.part(e.x, e.y, pal[3], 5, 50);
    this.rings.push({ x: e.x, y: e.y, r: 3, dr: 70, life: 0.16, max: 0.16, c: e.crit ? '#fff7b0' : '#ffffffaa' });
    const tierShake = b.t < 0 ? 2.5 : 1 + Math.min(1.5, Math.max(0, b.t) * 0.15);
    this.shake = Math.max(this.shake, tierShake + (e.crit ? 0.8 : 0));
    if (b.t < 0) this.text(e.x, e.y - 8, '+' + fmt(e.loot), '#ffd25a', 1, 1.4); else this.loot(e.x, e.y - 8, e.loot, '#fff2c8');
    const n = Math.min(7, 1 + Math.floor(Math.log10(e.loot + 1) * 1.5)) + (b.t < 0 ? 6 : 0);
    this.spawnMotes(e.x, e.y, n, b.t < 0 ? '#ffd25a' : '#a8dcff');
    if (b.t < 0) { this.flash = Math.max(this.flash, 0.3); this.flashColor = '255,226,140'; this.part(e.x, e.y, '#ffd25a', 18, 70); }
    if (e.combo >= 3) this.comboPulse = 0.18;
  }

  private spawnMotes(x: number, y: number, n: number, c: string) {
    for (let i = 0; i < n; i++) this.motes.push({ x, y, vx: rnd(-50, 50), vy: rnd(-80, -30), delay: 0.25 + i * 0.03, t: 0, c });
  }

  update(dt: number) {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 14);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.comboPulse = Math.max(0, this.comboPulse - dt);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.vy += 380 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.life -= dt;
      const col = Math.max(0, Math.min(COLS - 1, Math.floor((c.x + c.w / 2) / BS)));
      const floor = this.game.surfaceY(col) - c.w;
      if (c.vy > 0 && c.y > floor && c.y < floor + 10 && c.bounces < 2) { c.y = floor; c.vy *= -0.35; c.vx *= 0.55; c.bounces++; }
      if (c.life <= 0 || c.y > H + 8) this.chunks.splice(i, 1);
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      if (m.delay > 0) { m.delay -= dt; m.vy += 200 * dt; m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= 0.92; continue; }
      m.t += dt * 2.2;
      const k = Math.min(1, m.t * m.t);
      m.x += (MOTE_TARGET[0] - m.x) * k; m.y += (MOTE_TARGET[1] - m.y) * k;
      if (Math.abs(m.x - MOTE_TARGET[0]) < 2 && Math.abs(m.y - MOTE_TARGET[1]) < 2) { this.motes.splice(i, 1); this.onMote(); }
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.age += dt; t.y += t.vy * dt; t.vy *= 0.96; t.life -= dt; if (t.life <= 0) this.texts.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.r += r.dr * dt; r.life -= dt; if (r.life <= 0) this.rings.splice(i, 1); }
    for (const arr of [this.impacts, this.bolts, this.sweeps] as { life: number }[][]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); }
    for (const w of this.windows) if (Math.random() < dt * 0.02) w.on = !w.on;
    const wind = this.game.storm.wind;
    for (const s of this.streaks) { s.y += s.v * dt; s.x += wind * s.v * 0.3 * dt; if (s.y > H) { s.y = -s.l; s.x = rnd(0, W); } if (s.x < 0) s.x += W; if (s.x > W) s.x -= W; }
  }

  draw() {
    const g = this.g, game = this.game, t = this.t;
    const P = (x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w, h); };
    g.setTransform(1, 0, 0, 1, 0, 0);
    P(0, 0, W, H, '#0b0a18');
    const sx = this.shake > 0.3 ? Math.round(rnd(-this.shake, this.shake)) : 0;
    const sy = this.shake > 0.3 ? Math.round(rnd(-this.shake, this.shake)) : 0;
    g.setTransform(1, 0, 0, 1, sx, sy);

    g.drawImage(this.bg, 0, 0);
    for (const w of this.windows) if (w.on) P(w.x, w.y, 1, 1, w.c);
    if (game.storm.on) P(0, 0, W, TOP, 'rgba(8,6,22,0.42)');
    // dig area
    P(0, TOP, W, H - TOP, '#120f22');
    for (let y = TOP; y < H; y += 8) P(0, y, W, 1, '#16122a');
    for (let c = 0; c < COLS; c++) if (game.surfaceRow(c) >= ROWS) { P(c * BS, H - 3, BS, 3, '#2c4a86'); P(c * BS + (((t * 6) | 0) % BS), H - 3, 2, 1, '#6fa0e0'); }
    // rain
    const n = game.storm.on ? 90 : 36, wind = game.storm.wind;
    g.fillStyle = 'rgba(165,185,255,0.22)';
    for (let i = 0; i < n; i++) { const s = this.streaks[i]; for (let k = 0; k < s.l; k++) g.fillRect((s.x + wind * k * 0.3) | 0, (s.y + k) | 0, 1, 1); }
    // blocks
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const b = game.s.grid[r][c];
      if (b) drawBlock(g, b, c * BS, Math.round(game.blockY(r) + (b.squash > 0 ? 1 : 0)), t);
    }
    for (const im of this.impacts) { P(im.x - 1, im.y - 1, 18, 18, '#0b0a18'); P(im.x, im.y, 16, 16, '#ffffff'); }
    for (const s of this.sweeps) {
      const k = 1 - s.life / 0.35, x = k * (W + 40) - 20;
      g.globalAlpha = 0.25 * (1 - k); P(0, s.y, W, 16, '#9ff0c9'); g.globalAlpha = 1;
      P(x - 10, s.y, 6, 16, 'rgba(255,255,255,0.8)'); P(x - 3, s.y, 2, 16, '#fff');
    }
    // snail
    if (game.snail) {
      const x = Math.round(game.snail.x), y = Math.round(game.snailY()), f = game.snail.dir > 0, bob = Math.sin(t * 6) > 0 ? 0 : 1;
      P(x - 3, y + 3, 7, 1, '#cfe8a8'); P(f ? x + 3 : x - 4, y + 1 - bob, 1, 3, '#cfe8a8'); P(f ? x + 3 : x - 4, y - bob, 1, 1, '#3a2a2a');
      P(x - 2, y, 4, 3, '#ff9f7a'); P(x - 1, y + 1, 2, 1, '#c25a4a'); P(x - 2, y, 1, 1, '#ffd0b0');
    }
    // falling drops
    for (const d of game.drops) {
      const w = d.n >= 4 ? 3 : d.n >= 2 ? 2 : 1, c = d.acid ? '#9dff6a' : '#a8dcff';
      g.globalAlpha = 0.35; P(d.x - (w >> 1), d.y - w - 5, w, 4, c); g.globalAlpha = 1;
      P(d.x - (w >> 1), d.y - w - 1, w, w + 2, c); if (w > 1) P(d.x - (w >> 1), d.y - w - 1, 1, 1, '#fff');
    }
    // chunks
    for (const c of this.chunks) {
      if (c.delay > 0) continue;
      if (c.life < 0.3 && Math.floor(c.life * 20) % 2 === 0) continue;
      g.drawImage(c.img, c.sx, c.sy, c.w, c.w, c.x | 0, c.y | 0, c.w, c.w);
    }
    // roof + lights + spouts
    g.drawImage(this.roof, 0, 0);
    for (let h = 6; h < W; h += 32) {
      for (let x = 0; x < 32 && h + x < W; x++) { const k = x / 32; P(h + x + 1, 15 + Math.round(16 * k * (1 - k)), 1, 1, '#1c1a2b'); }
      for (let j = 1; j < 4; j++) {
        const x = h + 1 + j * 8, k = (j * 8) / 32, y = 16 + Math.round(16 * k * (1 - k)), c = BULBS[((h / 32) | 0) + j & 3];
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + h + j * 1.7);
        g.globalAlpha = 0.18 * tw + 0.08; P(x - 2, y - 1, 5, 4, c); g.globalAlpha = 1; P(x - 1, y, 2, 2, c);
      }
    }
    for (const s of game.spouts) {
      const x = Math.round(s.x), f = Math.min(1, s.b), c = game.ab.acid.left > 0 ? '#9dff6a' : '#a8dcff';
      P(x - 1, 15, 3, 1, '#25283a');
      if (f > 0.8) { P(x - 1, 16, 2, 2, c); P(x, 18, 1, 1, c); } else if (f > 0.5) P(x, 16, 1, 2, c); else if (f > 0.2) P(x, 16, 1, 1, c);
    }
    // lightning
    for (const b of this.bolts) {
      const fl = b.life / b.max > 0.5 || Math.floor(b.life * 40) % 2 === 0;
      if (!fl) continue;
      for (const path of b.paths) for (let i = 1; i < path.length; i++) {
        const [a, c] = path[i - 1], [d, e] = path[i];
        this.line(a + 1, c, d + 1, e, '#8a7cff'); this.line(a, c, d, e, '#fffbe0');
      }
    }
    // fx
    for (const r of this.rings) this.ring(r.x, r.y, r.r, r.c, r.life / r.max);
    for (const p of this.parts) { g.globalAlpha = Math.min(1, (p.life / p.max) * 1.5); P(p.x, p.y, p.s, p.s, p.c); }
    g.globalAlpha = 1;
    for (const m of this.motes) { P(m.x, m.y, 2, 2, m.c); P(m.x, m.y, 1, 1, '#fff'); }
    for (const tx of this.texts) {
      const a = Math.min(1, tx.life / tx.max * 2.5);
      const pop = tx.age < 0.08 ? 1 : 0;
      drawText(g, tx.s, tx.x, tx.y - pop, tx.c, { scale: tx.scale, alpha: a });
    }
    // combo
    const cb = game.combo, left = game.comboWindow() - (game.gt - cb.t);
    if (cb.n >= 3 && left > 0) {
      const sc = cb.n >= 15 ? 2 : 1, col = BULBS[Math.floor(t * 8) % 4];
      const y = TOP - 20 - (this.comboPulse > 0 ? 2 : 0);
      drawText(g, `x${cb.n} COMBO`, W / 2, y, col, { scale: sc });
      const bw = Math.round(40 * left / game.comboWindow());
      P(W / 2 - 20, y + 6 * sc + 1, 40, 1, '#2a2450'); P(W / 2 - 20, y + 6 * sc + 1, bw, 1, col);
    }
    if (game.armed) { g.globalAlpha = 0.22 + 0.12 * Math.sin(t * 8); P(0, TOP, W, H - TOP, '#fff7b0'); g.globalAlpha = 1; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.flash > 0) P(0, 0, W, H, `rgba(${this.flashColor},${Math.min(1, this.flash).toFixed(2)})`);
  }

  private line(x0: number, y0: number, x1: number, y1: number, c: string) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    this.g.fillStyle = c;
    for (let i = 0; i <= n; i++) { const k = n ? i / n : 0; this.g.fillRect((x0 + (x1 - x0) * k) | 0, (y0 + (y1 - y0) * k) | 0, 1, 1); }
  }
  private ring(cx: number, cy: number, r: number, c: string, a: number) {
    const g = this.g; g.globalAlpha = a; g.fillStyle = c;
    const steps = Math.max(8, Math.round(r * 5));
    for (let i = 0; i < steps; i++) { const ang = (i / steps) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r), 1, 1); }
    g.globalAlpha = 1;
  }

  private paintBg() {
    const c = document.createElement('canvas'); c.width = W; c.height = TOP;
    const b = c.getContext('2d')!;
    const P = (x: number, y: number, w: number, h: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, w, h); };
    const bands = ['#1a1835', '#211e44', '#2c2553', '#3a2c5f', '#4d3366'], bh = Math.ceil(TOP / bands.length);
    bands.forEach((col, i) => { P(0, i * bh, W, bh, col); if (i > 0) for (let x = 0; x < W; x++) if (x % 2 === 0) P(x, i * bh, 1, 1, bands[i - 1]); else P(x, i * bh - 1, 1, 1, col); });
    for (let i = 0; i < 28; i++) P(ri(W), ri(40), 1, 1, Math.random() < 0.3 ? '#fff4d6' : '#b9b0ee');
    const mx = 156, my = 34;
    for (let dy = -10; dy <= 10; dy++) for (let dx = -10; dx <= 10; dx++) {
      const d = dx * dx + dy * dy;
      if (d <= 49) P(mx + dx, my + dy, 1, 1, '#f1e6c2'); else if (d <= 90 && (dx + dy) % 2 === 0) P(mx + dx, my + dy, 1, 1, '#5a4a7a');
    }
    P(mx - 3, my - 2, 2, 2, '#d9cba4'); P(mx + 2, my + 2, 1, 1, '#d9cba4'); P(mx + 1, my - 4, 1, 1, '#d9cba4');
    for (const [x, y, w] of [[120, 40, 40], [20, 28, 34], [70, 50, 30]]) { P(x, y, w, 2, '#30295a'); P(x + 4, y - 1, w - 10, 1, '#30295a'); P(x + 2, y + 2, w - 6, 1, '#2a2450'); }
    const layer = (col: string, hmin: number, hmax: number, wc: string[], dens: number) => {
      let x = -2;
      while (x < W) {
        const w = 8 + ri(14), h = hmin + ri(hmax - hmin);
        P(x, TOP - h, w, h, col);
        if (Math.random() < 0.3) P(x + 2, TOP - h - 3, 2, 3, col);
        for (let yy = TOP - h + 3; yy < TOP - 2; yy += 4) for (let xx = x + 2; xx < x + w - 2; xx += 3)
          if (Math.random() < dens) this.windows.push({ x: xx, y: yy, c: wc[ri(wc.length)], on: Math.random() < 0.8 });
        x += w + ri(3);
      }
    };
    layer('#241f48', 22, 46, ['#e7a85a'], 0.12);
    layer('#151330', 10, 28, ['#ffcf7a', '#ffb35a', '#ffe6a8'], 0.2);
    return c;
  }
  private paintRoof() {
    const c = document.createElement('canvas'); c.width = W; c.height = 17;
    const b = c.getContext('2d')!;
    const P = (x: number, y: number, w: number, h: number, col: string) => { b.fillStyle = col; b.fillRect(x, y, w, h); };
    for (let k = 0; k < 3; k++) {
      const y = k * 4 - 1, o = (k % 2) * 3;
      for (let x = -6; x < W + 6; x += 6) { P(x + o, y, 6, 4, '#3b2b45'); P(x + o, y, 5, 1, '#4f3b5c'); P(x + o + 5, y, 1, 4, '#291e32'); P(x + o, y + 3, 6, 1, '#291e32'); }
    }
    P(0, 11, W, 4, '#5d6382'); P(0, 11, W, 1, '#9097b9'); P(0, 14, W, 1, '#4a4f6a'); P(0, 15, W, 1, '#30344a');
    for (let x = 6; x < W; x += 32) P(x, 10, 2, 6, '#2b2e40');
    return c;
  }
}
