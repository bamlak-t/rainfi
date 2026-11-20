import {
  ABILITIES, AbId, BASE_BPM, BS, COLS, H, ROWS, SKILLS, SPOUT_ORDER, TIERS, TOP, UPGRADES, UpId, W,
  hpAt, seasonGoal, shardsFor, skillById, skillCost, valAt,
} from './config';

export interface Block {
  t: number; // tier index, -1 = chest
  hp: number;
  max: number;
  v: number;
  corr: number;
  ct: number;
  seed: number;
  flash: number;
  squash: number;
}

export interface Save {
  v: 2;
  coins: number;
  depth: number;
  best: number;
  season: number;
  shards: number;
  gen: number;
  total: number;
  saved: number;
  lv: Record<UpId, number>;
  skills: Record<string, number>;
  unlocked: Record<AbId, boolean>;
  grid: (Block | null)[][];
  stats: { blocks: number; chests: number; snails: number; bestCombo: number; playTime: number; seasons: number };
}

export interface Spout { x: number; b: number; tgt: number }
export interface Drop { x: number; y: number; vy: number; vx: number; n: number; dmg: number; acid: boolean }
export interface Snail { x: number; dir: number; life: number }
export type Pt = [number, number];

export type GameEvent =
  | { type: 'beat'; sub: number; bar: number }
  | { type: 'drip'; col: number; n: number }
  | { type: 'hit'; x: number; y: number; dmg: number; crit: boolean; acid: boolean; tier: number }
  | { type: 'break'; x: number; y: number; block: Block; loot: number; combo: number; crit: boolean }
  | { type: 'rowClear'; y: number; bonus: number }
  | { type: 'lake'; x: number }
  | { type: 'bolt'; paths: Pt[][]; kind: 'player' | 'storm' | 'mini' }
  | { type: 'snail'; x: number; y: number; loot: number }
  | { type: 'storm'; on: boolean }
  | { type: 'banner'; text: string }
  | { type: 'buy' }
  | { type: 'unlock' }
  | { type: 'prestige'; shards: number };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (n: number) => Math.floor(Math.random() * n);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export function newSave(): Save {
  return {
    v: 2, coins: 0, depth: 0, best: 0, season: 0, shards: 0, gen: 0, total: 0, saved: 0,
    lv: { size: 0, rate: 0, spouts: 0, crit: 0, splash: 0, barrel: 0 },
    skills: {},
    unlocked: { heavy: false, acid: false, bolt: false },
    grid: [],
    stats: { blocks: 0, chests: 0, snails: 0, bestCombo: 0, playTime: 0, seasons: 0 },
  };
}

export class Game {
  s: Save;
  beatPos = 0;
  lastTick = -1;
  shift = 0;
  spouts: Spout[] = [];
  drops: Drop[] = [];
  snail: Snail | null = null;
  storm = { on: false, t: rnd(70, 140), left: 0, wind: 0, boltT: 0 };
  snailT = rnd(25, 50);
  ab: Record<AbId, { cd: number; left: number }> = { heavy: { cd: 0, left: 0 }, acid: { cd: 0, left: 0 }, bolt: { cd: 0, left: 0 } };
  armed = false;
  combo = { n: 0, t: -99 };
  gt = 0;
  idleT = 0;
  private rowCheck = false;
  private listeners: ((e: GameEvent) => void)[] = [];

  constructor(save?: Save) {
    this.s = save ?? newSave();
    if (!this.s.grid || this.s.grid.length !== ROWS) this.initGrid();
    this.syncSpouts();
  }

  on(fn: (e: GameEvent) => void) { this.listeners.push(fn); }
  private emit(e: GameEvent) { for (const l of this.listeners) l(e); }
  banner(text: string) { this.emit({ type: 'banner', text }); }

  // ---------- derived stats ----------
  sk(id: string) { return this.s.skills[id] || 0; }
  bpm() { return BASE_BPM + (this.sk('c6') ? 8 : 0); }
  beatLen() { return 60 / this.bpm(); }
  dropDmg(lv = this.s.lv.size) { return (1 + lv) * Math.pow(1.09, lv) * (1 + 0.15 * this.sk('r1')) * Math.pow(1.1, this.sk('r7')); }
  ratePerBeat(lv = this.s.lv.rate) { return Math.pow(1.1, lv) * (1 + 0.1 * this.sk('r2')) * (this.sk('c6') ? 1.25 : 1) * Math.pow(1.05, this.sk('c7')); }
  curRate() { return this.ratePerBeat() * (this.ab.heavy.left > 0 ? 3 : 1) * (this.storm.on ? 1.6 : 1); }
  critChance(lv = this.s.lv.crit) { return Math.min(0.75, 0.02 * lv + 0.03 * this.sk('r3')); }
  critMult() { return 3 + 0.5 * this.sk('r5'); }
  comboWindow() { return 1.4 + (this.sk('e6') ? 0.5 : 0); }
  comboBonus(n = this.combo.n) { const per = this.sk('e6') ? 0.06 : 0.03; return Math.min(per * 20, per * Math.max(0, n - 1)); }
  baseLoot() {
    let m = (1 + 0.15 * this.sk('e1')) * Math.pow(1.1, this.sk('e7'));
    if (this.storm.on) m *= this.sk('s6') ? 2 : 1.5;
    if (this.idleT > 30) m *= 1 + 0.1 * this.sk('c5');
    return m;
  }
  barrelRate(lv = this.s.lv.barrel) { return lv * 0.25 * valAt(this.s.depth) * (1 + 0.25 * this.sk('c1')) * Math.pow(1.2, this.sk('c7')) * Math.pow(1.1, this.sk('e7')); }
  cap(id: UpId) { return UPGRADES.find(u => u.id === id)!.cap(this.s.season); }
  cost(id: UpId, lv = this.s.lv[id]) { const u = UPGRADES.find(u => u.id === id)!; return u.baseCost * Math.pow(u.growth, lv); }
  goal() { return seasonGoal(this.s.season); }
  shardReward() { return shardsFor(this.s.depth, this.s.season); }
  heavyDur() { return ABILITIES.heavy.dur + 3 * this.sk('s1'); }

  // ---------- world ----------
  private mk(t: number, hp: number, v: number): Block {
    return { t, hp, max: hp, v, corr: 0, ct: 0, seed: 1 + ri(99999), flash: 0, squash: 0 };
  }
  topTierAt(d: number) { let top = 0; TIERS.forEach((t, i) => { if (t.min <= d) top = i; }); return top; }
  genRow(d: number): (Block | null)[] {
    const top = this.topTierAt(d);
    const hs = hpAt(d), vs = valAt(d);
    const chest = 0.02 * (1 + 0.5 * this.sk('e2'));
    const row: (Block | null)[] = [];
    for (let c = 0; c < COLS; c++) {
      if (d > 2 && Math.random() < 0.06) { row.push(null); continue; }
      if (d > 3 && Math.random() < chest) {
        row.push(this.mk(-1, Math.ceil(hs * TIERS[top].hp * 1.5), vs * TIERS[top].val * 15));
        continue;
      }
      const r = Math.random();
      let ti = r < 0.55 ? top : r < 0.85 ? Math.max(0, top - 1) : Math.max(0, top - 2);
      if (top < TIERS.length - 1 && d >= TIERS[top + 1].min - 4 && Math.random() < 0.15) ti = top + 1;
      const t = TIERS[ti];
      row.push(this.mk(ti, Math.ceil(hs * t.hp * rnd(0.85, 1.15)), vs * t.val));
    }
    return row;
  }
  initGrid() {
    this.s.gen = this.s.depth;
    this.s.grid = [];
    for (let r = 0; r < ROWS; r++) this.s.grid.push(this.genRow(this.s.gen++));
  }
  surfaceRow(c: number) { for (let r = 0; r < ROWS; r++) if (this.s.grid[r][c]) return r; return ROWS; }
  surfaceY(c: number) { const r = this.surfaceRow(c); return r < ROWS ? TOP + r * BS + this.shift : H - 1; }
  blockY(r: number) { return TOP + r * BS + this.shift; }

  syncSpouts() {
    const n = 1 + this.s.lv.spouts;
    while (this.spouts.length < n) {
      const i = this.spouts.length;
      this.spouts.push({ x: SPOUT_ORDER[i] * BS + 8, b: (i * 0.37) % 1, tgt: SPOUT_ORDER[i] });
    }
    while (this.spouts.length > n) this.spouts.pop();
  }
  private assignTargets() {
    let min = ROWS;
    for (let c = 0; c < COLS; c++) min = Math.min(min, this.surfaceRow(c));
    const cands: number[] = [];
    for (let c = 0; c < COLS; c++) if (this.surfaceRow(c) === min) cands.push(c);
    if (!cands.length) return;
    const taken = new Set<number>();
    for (const s of this.spouts) {
      let best = cands[0], bd = 1e9;
      for (const c of cands) {
        if (taken.has(c) && taken.size < cands.length) continue;
        const d = Math.abs(c * BS + 8 - s.x);
        if (d < bd) { bd = d; best = c; }
      }
      s.tgt = best; taken.add(best);
    }
  }

  // ---------- economy ----------
  gain(v: number) { this.s.coins += v; this.s.total += v; }
  buy(id: UpId) {
    const lv = this.s.lv[id], c = this.cost(id);
    if (lv >= this.cap(id) || this.s.coins < c) return false;
    this.s.coins -= c; this.s.lv[id]++;
    if (id === 'spouts') this.syncSpouts();
    this.emit({ type: 'buy' });
    return true;
  }
  canSkill(id: string) {
    const d = skillById[id], r = this.sk(id);
    if (r >= d.max) return false;
    const met = d.req.map(q => this.sk(q) > 0);
    if (d.req.length && !(d.reqAny ? met.some(Boolean) : met.every(Boolean))) return false;
    return this.s.shards >= skillCost(d, r);
  }
  skillReqMet(id: string) {
    const d = skillById[id];
    if (!d.req.length) return true;
    const met = d.req.map(q => this.sk(q) > 0);
    return d.reqAny ? met.some(Boolean) : met.every(Boolean);
  }
  buySkill(id: string) {
    if (!this.canSkill(id)) return false;
    const d = skillById[id];
    this.s.shards -= skillCost(d, this.sk(id));
    this.s.skills[id] = this.sk(id) + 1;
    this.emit({ type: 'unlock' });
    return true;
  }
  prestige() {
    const gainS = this.shardReward();
    if (gainS <= 0) return false;
    const s = this.s;
    s.shards += gainS;
    s.season++;
    s.stats.seasons++;
    for (const k of Object.keys(s.lv) as UpId[]) s.lv[k] = Math.floor(s.lv[k] / 2);
    s.coins = 0;
    s.depth = 5 * this.sk('e5');
    this.initGrid();
    this.drops = []; this.spouts = []; this.syncSpouts();
    this.storm = { on: false, t: rnd(70, 140), left: 0, wind: 0, boltT: 0 };
    this.snail = null; this.shift = 0; this.combo = { n: 0, t: -99 };
    for (const k of Object.keys(this.ab) as AbId[]) this.ab[k] = { cd: 0, left: 0 };
    this.emit({ type: 'prestige', shards: gainS });
    this.emit({ type: 'storm', on: false });
    return true;
  }

  // ---------- abilities ----------
  useAbility(k: AbId) {
    const d = ABILITIES[k], a = this.ab[k];
    if (!this.s.unlocked[k]) {
      if (this.s.coins < d.cost) return;
      this.s.coins -= d.cost; this.s.unlocked[k] = true;
      this.banner(`Unlocked ${d.name} ${d.icon}`);
      this.emit({ type: 'unlock' });
      return;
    }
    if (a.cd > 0) return;
    if (k === 'bolt') { this.armed = !this.armed; if (this.armed) this.banner('⚡ Tap a column to strike'); return; }
    a.left = k === 'heavy' ? this.heavyDur() : d.dur;
    a.cd = d.cd;
    this.banner(`${d.icon} ${d.name}!`);
  }
  private autopilot() {
    if (!this.sk('c4')) return;
    for (const k of ['heavy', 'acid'] as AbId[]) if (this.s.unlocked[k] && this.ab[k].cd <= 0) this.useAbility(k);
    if (this.s.unlocked.bolt && this.ab.bolt.cd <= 0 && !this.armed) {
      let best = 0, bh = -1;
      for (let c = 0; c < COLS; c++) { const r = this.surfaceRow(c); const b = r < ROWS ? this.s.grid[r][c] : null; if (b && b.hp > bh) { bh = b.hp; best = c; } }
      this.ab.bolt.cd = ABILITIES.bolt.cd;
      this.strike(best, 'player');
    }
  }

  // ---------- combat ----------
  private release(s: Spout, n: number) {
    const col = clamp(Math.floor(s.x / BS), 0, COLS - 1);
    const merge = n > 1 ? 1 + 0.3 * this.sk('r4') : 1;
    this.drops.push({ x: s.x, y: 17, vy: 25, vx: this.storm.on ? this.storm.wind * 22 : 0, n, dmg: this.dropDmg() * n * merge, acid: this.ab.acid.left > 0 });
    this.emit({ type: 'drip', col, n });
  }
  private hitBlock(r: number, c: number, dmg: number, o: { acid?: boolean; crit?: boolean; plain?: boolean } = {}) {
    const b = this.s.grid[r]?.[c];
    if (!b) return;
    const T = b.t >= 0 ? TIERS[b.t] : null;
    let m = 1;
    if (o.acid) {
      const caustic = (1 + 0.5 * this.sk('s2')) * Math.pow(1.2, this.sk('s7'));
      m *= (T?.metal ? 3 : 1.5) * caustic;
      b.corr = Math.max(b.corr, dmg * 0.5 * caustic);
      b.ct = 4;
    } else if (o.plain && T?.hot) m *= 1.5;
    if (o.crit && T?.brittle) m *= 2;
    const total = dmg * m;
    b.hp -= total; b.flash = 0.06; b.squash = 0.09;
    const x = c * BS + 8, y = this.blockY(r) + 8;
    this.emit({ type: 'hit', x, y, dmg: total, crit: !!o.crit, acid: !!o.acid, tier: b.t });
    if (b.hp > 0 && this.sk('e4') && b.hp < b.max * 0.1 * this.sk('e4')) b.hp = 0;
    if (b.hp <= 0) this.breakBlock(r, c, !!o.crit);
  }
  private breakBlock(r: number, c: number, crit = false) {
    const b = this.s.grid[r][c];
    if (!b) return;
    this.s.grid[r][c] = null;
    if (this.gt - this.combo.t < this.comboWindow()) this.combo.n++; else this.combo.n = 1;
    this.combo.t = this.gt;
    this.s.stats.bestCombo = Math.max(this.s.stats.bestCombo, this.combo.n);
    this.s.stats.blocks++;
    const loot = b.v * this.baseLoot() * (1 + this.comboBonus());
    this.gain(loot);
    this.emit({ type: 'break', x: c * BS + 8, y: this.blockY(r) + 8, block: b, loot, combo: this.combo.n, crit });
    if (b.t < 0) { this.s.stats.chests++; this.banner(`🎁 Treasure chest!`); }
    this.rowCheck = true;
  }
  private checkRows() {
    this.rowCheck = false;
    while (this.s.grid[0].every(b => !b)) {
      const y = this.blockY(0);
      const bonus = valAt(this.s.depth) * COLS * 0.15 * TIERS[this.topTierAt(this.s.depth)].val * (1 + 0.5 * this.sk('e3')) * this.baseLoot();
      this.gain(bonus);
      this.emit({ type: 'rowClear', y, bonus });
      this.s.grid.shift();
      this.s.grid.push(this.genRow(this.s.gen++));
      this.s.depth++;
      this.shift += BS;
      if (this.s.depth > this.s.best) this.s.best = this.s.depth;
      const t = TIERS.find(t => t.min === this.s.depth && t.min > 0);
      if (t) this.banner(`You reach the ${t.name} layer…`);
      else if (this.s.depth === this.goal()) this.banner('☀ Season goal reached. Clear Skies is ready');
      else if (this.s.depth % 25 === 0) this.banner(`Depth ${this.s.depth}`);
    }
  }
  private impact(d: Drop, col: number, r: number, ty: number) {
    if (this.snail && Math.floor(this.snail.x / BS) === col) this.bonk();
    if (r >= ROWS) {
      this.gain(valAt(this.s.depth) * 0.2 * d.n * this.baseLoot());
      this.emit({ type: 'lake', x: d.x });
      return;
    }
    const crit = Math.random() < this.critChance();
    const dmg = d.dmg * (crit ? this.critMult() : 1);
    this.hitBlock(r, col, dmg, { acid: d.acid, crit, plain: !d.acid });
    if (this.s.lv.splash) for (const dc of [-1, 1]) {
      const c2 = col + dc;
      if (c2 >= 0 && c2 < COLS && this.s.grid[r][c2]) this.hitBlock(r, c2, d.dmg * 0.2 * this.s.lv.splash, { acid: d.acid });
    }
    if (this.sk('s5') && Math.random() < 0.01 * this.sk('s5')) this.strike(col, 'mini');
    void ty;
  }
  strike(col: number, kind: 'player' | 'storm' | 'mini') {
    const mult = kind === 'player' ? 25 : kind === 'storm' ? 10 : 5;
    const dmg = this.dropDmg() * mult * (1 + 0.25 * this.sk('s3')) * Math.pow(1.2, this.sk('s7'));
    const r = this.surfaceRow(col), x = col * BS + 8;
    const ty = r < ROWS ? this.blockY(r) + 6 : H - 2;
    const paths: Pt[][] = [zig(x + rnd(-8, 8), 0, x, ty)];
    if (r < ROWS) {
      const g = this.s.grid;
      const isMetal = (rr: number, cc: number) => { const b = g[rr]?.[cc]; return !!b && b.t >= 0 && !!TIERS[b.t].metal; };
      const targets: [number, number][] = [];
      if (isMetal(r, col)) for (const [dr, dc] of [[0, -1], [0, 1], [1, 0]]) if (isMetal(r + dr, col + dc)) targets.push([r + dr, col + dc]);
      const extra = kind === 'mini' ? 0 : this.sk('s3');
      for (let i = 0; i < extra; i++) {
        const cc = col + (i % 2 ? -1 : 1) * (1 + (i >> 1));
        if (cc >= 0 && cc < COLS) { const rr = this.surfaceRow(cc); if (rr < ROWS) targets.push([rr, cc]); }
      }
      this.hitBlock(r, col, dmg);
      if (r + 1 < ROWS) this.hitBlock(r + 1, col, dmg * 0.5);
      for (const [rr, cc] of targets) {
        paths.push(zig(x, ty, cc * BS + 8, this.blockY(rr) + 8));
        this.hitBlock(rr, cc, dmg * 0.6);
      }
    }
    if (this.snail && Math.floor(this.snail.x / BS) === col) this.bonk();
    this.emit({ type: 'bolt', paths, kind });
  }
  snailY() { return this.snail ? this.surfaceY(clamp(Math.floor(this.snail.x / BS), 0, COLS - 1)) - 4 : 0; }
  spawnSnail() { const dir = Math.random() < 0.5 ? 1 : -1; this.snail = { x: dir > 0 ? 1 : W - 2, dir, life: 32 }; this.banner('🐌 A snail wanders by. Rain on it!'); }
  bonk() {
    if (!this.snail) return;
    const top = this.topTierAt(this.s.gen);
    const loot = 8 * TIERS[top].val * valAt(this.s.depth) * this.baseLoot() * (1 + this.sk('c2'));
    this.gain(loot);
    this.s.stats.snails++;
    this.emit({ type: 'snail', x: this.snail.x, y: this.snailY(), loot });
    this.snail = null;
    this.snailT = rnd(35, 70) / (this.sk('c2') ? 2 : 1);
  }
  startStorm() {
    this.storm.on = true; this.storm.left = 16 + (this.sk('s6') ? 5 : 0); this.storm.boltT = 2;
    this.banner(`⛈ A storm rolls in · faster rain · loot ×${this.sk('s6') ? 2 : 1.5}`);
    this.emit({ type: 'storm', on: true });
  }
  endStorm() {
    this.storm.on = false; this.storm.wind = 0; this.storm.t = rnd(70, 140) / (1 + 0.25 * this.sk('s4'));
    this.banner('🌈 The storm passes');
    this.emit({ type: 'storm', on: false });
  }

  tap(x: number, y: number) {
    this.idleT = 0;
    const col = clamp(Math.floor(x / BS), 0, COLS - 1);
    if (this.armed) { this.armed = false; this.ab.bolt.cd = ABILITIES.bolt.cd; this.strike(col, 'player'); return; }
    if (this.snail && Math.abs(x - this.snail.x) < 10 && Math.abs(y - this.snailY()) < 10) { this.bonk(); return; }
    this.drops.push({ x: clamp(x, 1, W - 2), y: Math.min(Math.max(y, 17), TOP - 4), vy: 40, vx: 0, n: 1, dmg: this.dropDmg(), acid: this.ab.acid.left > 0 });
    this.emit({ type: 'drip', col, n: 1 });
  }

  // ---------- loop ----------
  private onTick(t: number) {
    const sub = ((t % 16) + 16) % 16, bar = Math.floor(t / 16);
    this.emit({ type: 'beat', sub, bar });
    this.assignTargets();
    for (const s of this.spouts) if (s.b >= 1) { const n = Math.min(8, Math.floor(s.b)); s.b -= n; this.release(s, n); }
    if (sub === 0 && this.sk('r6')) for (const s of this.spouts) this.release(s, 4);
    if (this.storm.on && t % 12 === 0) this.storm.wind = [-1, 0, 0, 1][ri(4)];
    if (sub % 4 === 0) this.autopilot();
  }

  update(dt: number) {
    this.gt += dt;
    this.idleT += dt;
    this.s.stats.playTime += dt;
    const rate = this.curRate();
    for (const s of this.spouts) {
      s.b += rate * dt / this.beatLen();
      const dx = s.tgt * BS + 8 - s.x;
      s.x += clamp(dx, -50 * dt, 50 * dt);
    }
    this.beatPos += dt / this.beatLen();
    const tick = Math.floor(this.beatPos * 4);
    if (tick !== this.lastTick) { for (let t = this.lastTick + 1; t <= tick; t++) this.onTick(t); this.lastTick = tick; }

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.vy += 320 * dt; d.y += d.vy * dt; d.x = clamp(d.x + d.vx * dt, 1, W - 2);
      const col = clamp(Math.floor(d.x / BS), 0, COLS - 1), r = this.surfaceRow(col);
      const ty = r < ROWS ? this.blockY(r) : H - 1;
      if (d.y >= ty) { this.drops.splice(i, 1); this.impact(d, col, r, ty); }
    }
    const g = this.s.grid;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const b = g[r][c];
      if (!b) continue;
      if (b.flash > 0) b.flash -= dt;
      if (b.squash > 0) b.squash -= dt;
      if (b.ct > 0) {
        b.ct -= dt;
        const metal = b.t >= 0 && TIERS[b.t].metal;
        b.hp -= b.corr * dt * (metal ? 3 : 1);
        if (b.hp <= 0) this.breakBlock(r, c);
      }
    }
    if (this.rowCheck) this.checkRows();
    this.shift = Math.max(0, this.shift - dt * 48);
    if (this.s.lv.barrel) this.gain(this.barrelRate() * dt);
    for (const k of Object.keys(this.ab) as AbId[]) { this.ab[k].cd = Math.max(0, this.ab[k].cd - dt); this.ab[k].left = Math.max(0, this.ab[k].left - dt); }

    const st = this.storm;
    if (!st.on) { if (this.s.depth >= 8 || this.s.season > 0) { st.t -= dt; if (st.t <= 0) this.startStorm(); } }
    else { st.left -= dt; st.boltT -= dt; if (st.boltT <= 0) { st.boltT = rnd(2.5, 5); this.strike(ri(COLS), 'storm'); } if (st.left <= 0) this.endStorm(); }

    if (!this.snail) { if (this.s.depth >= 2 || this.s.season > 0) { this.snailT -= dt; if (this.snailT <= 0) this.spawnSnail(); } }
    else { const sn = this.snail; sn.x += sn.dir * 5 * dt; sn.life -= dt; if (sn.x < -4 || sn.x > W + 4 || sn.life <= 0) { this.snail = null; this.snailT = rnd(35, 70); } }
  }

  offlineGain(elapsedSec: number) {
    const capH = 8 + 4 * this.sk('c3');
    const eff = 0.5 + 0.25 * this.sk('c3');
    return this.barrelRate() * Math.min(elapsedSec, capH * 3600) * eff;
  }
}

export function zig(x0: number, y0: number, x1: number, y1: number): Pt[] {
  const pts: Pt[] = [[x0, y0]];
  const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 7));
  for (let i = 1; i < steps; i++) { const t = i / steps; pts.push([x0 + (x1 - x0) * t + rnd(-4, 4), y0 + (y1 - y0) * t]); }
  pts.push([x1, y1]);
  return pts;
}

export { SKILLS };
