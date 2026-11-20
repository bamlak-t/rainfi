// Headless pacing sim: a simple bot plays the real Game module and reports
// how long each season takes. Run: npm run sim [hours]
import { ABILITIES, AbId, COLS, ROWS, SKILLS, UPGRADES, skillCost } from '../src/config';
import { Game } from '../src/game';

const hours = Number(process.argv[2] ?? 8);
const g = new Game();
const DT = 1 / 30;
let t = 0, lastDepth = 0, lastDepthT = 0, seasonStart = 0;
const fmtT = (s: number) => `${Math.floor(s / 60)}m`.padStart(5);
const milestones = new Set<number>();

function bot() {
  for (const k of Object.keys(ABILITIES) as AbId[]) {
    if (!g.s.unlocked[k] && g.s.coins >= ABILITIES[k].cost * 1.5) g.useAbility(k);
  }
  let bought = true;
  while (bought) {
    bought = false;
    let best: (typeof UPGRADES)[number] | null = null, bc = Infinity;
    for (const u of UPGRADES) {
      if (g.s.lv[u.id] >= g.cap(u.id)) continue;
      const c = g.cost(u.id);
      if (c < bc) { bc = c; best = u; }
    }
    if (best && g.s.coins >= bc) bought = g.buy(best.id);
  }
  for (const k of ['heavy', 'acid'] as AbId[]) if (g.s.unlocked[k] && g.ab[k].cd <= 0) g.useAbility(k);
  if (g.s.unlocked.bolt && g.ab.bolt.cd <= 0) {
    let col = 0, bh = -1;
    for (let c = 0; c < COLS; c++) { const r = g.surfaceRow(c); const b = r < ROWS ? g.s.grid[r][c] : null; if (b && b.hp > bh) { bh = b.hp; col = c; } }
    g.ab.bolt.cd = ABILITIES.bolt.cd; g.strike(col, 'player');
  }
  if (g.snail && Math.random() < 0.02) g.bonk();
}

function spendShards() {
  let ok = true;
  while (ok) {
    ok = false;
    const opts = SKILLS.filter(s => g.canSkill(s.id)).sort((a, b) => skillCost(a, g.sk(a.id)) - skillCost(b, g.sk(b.id)));
    if (opts.length) ok = g.buySkill(opts[0].id);
  }
}

console.log('season | time  | season len | depth | shards | levels (size/rate/spouts/crit/splash/barrel)');
while (t < hours * 3600) {
  g.update(DT); t += DT;
  if (Math.floor(t / DT) % 15 === 0) bot();
  if (g.s.depth !== lastDepth) { lastDepth = g.s.depth; lastDepthT = t; }
  for (const m of [10, 25, 40, 60, 100, 150, 200, 300, 400]) if (g.s.depth >= m && !milestones.has(m)) { milestones.add(m); console.log(`   depth ${m} first reached at ${fmtT(t)}`); }
  const stuck = t - lastDepthT > 150;
  if (g.shardReward() > 0 && stuck) {
    const lv = Object.values(g.s.lv).join('/');
    const sh = g.shardReward();
    console.log(`${String(g.s.season).padStart(6)} | ${fmtT(t)} | ${fmtT(t - seasonStart)}      | ${String(g.s.depth).padStart(5)} | ${String(sh).padStart(6)} | ${lv}`);
    g.prestige(); spendShards(); seasonStart = t; lastDepth = g.s.depth; lastDepthT = t;
  }
}
const spent = SKILLS.reduce((a, s) => { let c = 0; for (let r = 0; r < g.sk(s.id); r++) c += skillCost(s, r); return a + c; }, 0);
const all = SKILLS.reduce((a, s) => { let c = 0; for (let r = 0; r < Math.min(s.max, 1e9) && s.max < 999; r++) c += skillCost(s, r); return a + c; }, 0);
console.log(`after ${hours}h: season ${g.s.season}, depth ${g.s.depth}, best ${g.s.best}, skill tree ${spent}/${all} shards spent`);
