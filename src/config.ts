// ---------- world ----------
export const W = 192;
export const H = 176;
export const COLS = 12;
export const ROWS = 5;
export const BS = 16;
export const TOP = H - ROWS * BS; // 96
export const BASE_BPM = 76;
export const SAVE_KEY = 'rainfi-save-v2';
export const SPOUT_ORDER = [5, 6, 2, 9, 0, 11, 3, 8, 1, 10, 4, 7];

export type Palette = [base: string, light: string, dark: string, accent: string];

export interface Tier {
  key: string;
  name: string;
  min: number;
  hp: number;
  val: number;
  pal: Palette;
  metal?: boolean;   // acid ×3, lightning chains through it
  brittle?: boolean; // crits do ×2 extra
  hot?: boolean;     // rain cools it: +50% from plain drops
}

export const TIERS: Tier[] = [
  { key: 'dirt', name: 'dirt', min: 0, hp: 1, val: 1, pal: ['#6b4a3a', '#87604a', '#4a3128', '#a3805c'] },
  { key: 'clay', name: 'clay', min: 8, hp: 1.1, val: 1.15, pal: ['#a0583c', '#bf704d', '#74402c', '#d99474'] },
  { key: 'stone', name: 'stone', min: 18, hp: 1.25, val: 1.3, pal: ['#686a82', '#8a8ca6', '#484a60', '#b0b2c8'] },
  { key: 'iron', name: 'iron', min: 32, hp: 1.5, val: 1.5, metal: true, pal: ['#555968', '#7a7f92', '#363844', '#c0683a'] },
  { key: 'crystal', name: 'crystal', min: 50, hp: 1.2, val: 1.8, brittle: true, pal: ['#3a467a', '#566fb0', '#252f5a', '#8ff0ff'] },
  { key: 'ruins', name: 'ruins', min: 75, hp: 1.6, val: 2.1, pal: ['#76664f', '#978566', '#524637', '#e8c66a'] },
  { key: 'obsidian', name: 'obsidian', min: 105, hp: 2, val: 2.4, pal: ['#241a33', '#3d2d55', '#120c1c', '#9a7cff'] },
  { key: 'fossil', name: 'fossil bed', min: 140, hp: 1.7, val: 2.8, pal: ['#b8a07a', '#d2bc94', '#8a7556', '#f2ead8'] },
  { key: 'magma', name: 'magma rock', min: 180, hp: 2.2, val: 3.2, hot: true, pal: ['#3a2420', '#553330', '#21140f', '#ff8a3a'] },
  { key: 'star', name: 'starstone', min: 230, hp: 2.4, val: 3.8, pal: ['#1c2350', '#2d3878', '#10142e', '#fff4b0'] },
  { key: 'core', name: 'the core', min: 300, hp: 2.8, val: 4.5, metal: true, brittle: true, pal: ['#5a2a6a', '#8a4aa0', '#341640', '#ffd0ff'] },
];
export const CHEST_PAL: Palette = ['#7a4a26', '#a0652f', '#4e2e18', '#ffd25a'];

export const hpAt = (d: number) => 4 * Math.pow(1.11, d);
export const valAt = (d: number) => Math.pow(1.055, d);

// ---------- upgrades (bought with drops, capped per season) ----------
export type UpId = 'size' | 'rate' | 'spouts' | 'crit' | 'splash' | 'barrel';
export interface UpDef {
  id: UpId;
  name: string;
  baseCost: number;
  growth: number;
  cap: (season: number) => number;
}
export const UPGRADES: UpDef[] = [
  { id: 'size', name: 'Bigger Drops', baseCost: 8, growth: 1.38, cap: s => 12 + 8 * s },
  { id: 'rate', name: 'Drip Rate', baseCost: 12, growth: 1.45, cap: s => 8 + 5 * s },
  { id: 'spouts', name: 'Drip Points', baseCost: 25, growth: 3, cap: s => Math.min(11, 2 + s) },
  { id: 'crit', name: 'Sharp Drops', baseCost: 100, growth: 1.7, cap: s => Math.min(25, 4 + 3 * s) },
  { id: 'splash', name: 'Splash', baseCost: 80, growth: 2, cap: s => Math.min(8, 1 + s) },
  { id: 'barrel', name: 'Rain Barrel', baseCost: 50, growth: 1.5, cap: s => 8 + 4 * s },
];

// ---------- weather abilities (unlocked once with drops, kept forever) ----------
export type AbId = 'heavy' | 'acid' | 'bolt';
export const ABILITIES: Record<AbId, { name: string; icon: string; cd: number; dur: number; cost: number; desc: string }> = {
  heavy: { name: 'Heavy Rain', icon: '🌧', cd: 30, dur: 8, cost: 50, desc: '×3 drip rate' },
  acid: { name: 'Acid Rain', icon: '🧪', cd: 45, dur: 10, cost: 400, desc: 'corrodes · ×3 vs metal' },
  bolt: { name: 'Lightning', icon: '⚡', cd: 15, dur: 0, cost: 2000, desc: 'tap a column' },
};

// ---------- seasons ----------
export const seasonGoal = (season: number) => 40 + 15 * season;
export const shardsFor = (depth: number, season: number) =>
  depth < seasonGoal(season) ? 0 : Math.floor(Math.pow(depth / 15, 1.5)) + season;

// ---------- skill tree (bought with rainbow shards) ----------
export type Branch = 'rain' | 'storm' | 'earth' | 'calm';
export interface SkillDef {
  id: string;
  branch: Branch;
  name: string;
  icon: string;
  max: number;
  base: number;
  req: string[];
  reqAny?: boolean;
  desc: (rank: number) => string;
}
export const skillCost = (s: SkillDef, rank: number) => Math.ceil(s.base * (1 + rank * 0.6));

export const BRANCHES: Record<Branch, { name: string; color: string }> = {
  rain: { name: 'Rain', color: '#9fd3ff' },
  storm: { name: 'Storm', color: '#b79bff' },
  earth: { name: 'Earth', color: '#e8c66a' },
  calm: { name: 'Calm', color: '#9ff0c9' },
};

const pct = (n: number) => `${Math.round(n)}%`;
export const SKILLS: SkillDef[] = [
  // Rain
  { id: 'r1', branch: 'rain', name: 'Heavier Drops', icon: '💧', max: 10, base: 1, req: [], desc: r => `+${pct(15 * r)} drop damage (+15% per rank)` },
  { id: 'r2', branch: 'rain', name: 'Quick Gutters', icon: '⏩', max: 5, base: 2, req: ['r1'], desc: r => `+${pct(10 * r)} drip rate (+10% per rank)` },
  { id: 'r3', branch: 'rain', name: 'Keen Drops', icon: '✦', max: 5, base: 2, req: ['r1'], desc: r => `+${pct(3 * r)} crit chance (+3% per rank)` },
  { id: 'r4', branch: 'rain', name: 'Merge Mastery', icon: '◉', max: 3, base: 3, req: ['r2'], desc: r => `merged drops deal +${pct(30 * r)} damage` },
  { id: 'r5', branch: 'rain', name: 'Shatter Crits', icon: '✸', max: 4, base: 3, req: ['r3'], desc: r => `crits deal ×${(3 + 0.5 * r).toFixed(1)} (base ×3)` },
  { id: 'r6', branch: 'rain', name: 'Downpour', icon: '☔', max: 1, base: 12, req: ['r4', 'r5'], desc: () => 'every bar, every drip point also drops a ×4 merged drop' },
  { id: 'r7', branch: 'rain', name: 'Endless Rain', icon: '∞', max: 999, base: 5, req: ['r6'], desc: r => `drop damage ×${Math.pow(1.1, r).toFixed(2)} (×1.1 per rank, repeatable)` },
  // Storm
  { id: 's1', branch: 'storm', name: 'Long Showers', icon: '🌧', max: 3, base: 1, req: [], desc: r => `Heavy Rain lasts +${3 * r}s` },
  { id: 's2', branch: 'storm', name: 'Caustic', icon: '🧪', max: 3, base: 2, req: ['s1'], desc: r => `acid damage +${pct(50 * r)}` },
  { id: 's3', branch: 'storm', name: 'Conductor', icon: '⚡', max: 3, base: 2, req: ['s1'], desc: r => `lightning +${pct(25 * r)} damage and arcs to ${r} extra block${r === 1 ? '' : 's'}` },
  { id: 's4', branch: 'storm', name: 'Stormcaller', icon: '⛈', max: 3, base: 3, req: ['s2', 's3'], reqAny: true, desc: r => `storms come ${pct(25 * r)} more often` },
  { id: 's5', branch: 'storm', name: 'Static', icon: '✧', max: 5, base: 3, req: ['s3'], desc: r => `${r}% of drops call a mini lightning bolt` },
  { id: 's6', branch: 'storm', name: 'Eye of the Storm', icon: '🌀', max: 1, base: 12, req: ['s4', 's5'], desc: () => 'storms give ×2 loot (not ×1.5) and last 5s longer' },
  { id: 's7', branch: 'storm', name: 'Thunderhead', icon: '∞', max: 999, base: 5, req: ['s6'], desc: r => `lightning and acid ×${Math.pow(1.2, r).toFixed(2)} (×1.2 per rank, repeatable)` },
  // Earth
  { id: 'e1', branch: 'earth', name: 'Prospector', icon: '⛏', max: 10, base: 1, req: [], desc: r => `+${pct(15 * r)} loot from everything` },
  { id: 'e2', branch: 'earth', name: 'Treasure Sense', icon: '🎁', max: 3, base: 2, req: ['e1'], desc: r => `chests appear ${pct(50 * r)} more often` },
  { id: 'e3', branch: 'earth', name: 'Fault Lines', icon: '〰', max: 4, base: 2, req: ['e1'], desc: r => `row-clear bonus +${pct(50 * r)}` },
  { id: 'e4', branch: 'earth', name: 'Brittle Earth', icon: '💥', max: 3, base: 3, req: ['e3'], desc: r => `blocks under ${10 * r}% health crumble instantly` },
  { id: 'e5', branch: 'earth', name: 'Deep Start', icon: '⤓', max: 4, base: 3, req: ['e2'], desc: r => `new seasons start at depth ${5 * r}` },
  { id: 'e6', branch: 'earth', name: 'Motherlode', icon: '💎', max: 1, base: 12, req: ['e4', 'e5'], desc: () => 'combo loot bonus doubled and the combo window is 0.5s longer' },
  { id: 'e7', branch: 'earth', name: 'Bottomless', icon: '∞', max: 999, base: 5, req: ['e6'], desc: r => `all loot ×${Math.pow(1.1, r).toFixed(2)} (×1.1 per rank, repeatable)` },
  // Calm
  { id: 'c1', branch: 'calm', name: 'Bigger Barrel', icon: '🛢', max: 8, base: 1, req: [], desc: r => `idle income +${pct(25 * r)}` },
  { id: 'c2', branch: 'calm', name: 'Snail Friend', icon: '🐌', max: 3, base: 1, req: ['c1'], desc: r => `snails visit twice as often and give +${pct(100 * r)} bonus` },
  { id: 'c3', branch: 'calm', name: 'Long Nap', icon: '😴', max: 2, base: 2, req: ['c1'], desc: r => `offline earnings ${50 + 25 * r}% (base 50%), up to ${8 + 4 * r}h` },
  { id: 'c4', branch: 'calm', name: 'Autopilot', icon: '🤖', max: 1, base: 4, req: ['c2', 'c3'], reqAny: true, desc: () => 'weather abilities cast themselves when ready' },
  { id: 'c5', branch: 'calm', name: 'Soft Focus', icon: '🍵', max: 3, base: 3, req: ['c4'], desc: r => `+${pct(10 * r)} loot after 30s without tapping` },
  { id: 'c6', branch: 'calm', name: 'Lo-fi Heart', icon: '🎧', max: 1, base: 12, req: ['c5'], desc: () => 'the music speeds up to 84 BPM and drip rate +25%' },
  { id: 'c7', branch: 'calm', name: 'Deep Calm', icon: '∞', max: 999, base: 5, req: ['c6'], desc: r => `drip rate ×${Math.pow(1.05, r).toFixed(2)} and idle ×${Math.pow(1.2, r).toFixed(2)} (repeatable)` },
];
export const skillById = Object.fromEntries(SKILLS.map(s => [s.id, s])) as Record<string, SkillDef>;
