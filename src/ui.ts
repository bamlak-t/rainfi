import { ABILITIES, AbId, BRANCHES, Branch, SKILLS, UPGRADES, UpId, skillById, skillCost } from './config';
import { fmt } from './font';
import type { Game } from './game';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const el = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class UI {
  private upEls = new Map<UpId, HTMLButtonElement>();
  private abEls = new Map<AbId, HTMLButtonElement>();
  private nodeEls = new Map<string, HTMLButtonElement>();
  private selected = 'r1';
  private confirmPrestige = false;
  private bannerTimer = 0;
  speed = 1;
  onWipe: () => void = () => {};

  constructor(private game: Game) {
    this.buildAbilities();
    this.buildUpgrades();
    this.buildTree();
    this.buildTabs();
    this.buildTinker();
    $('#prestigeBtn').onclick = () => this.prestige();
    $('#skillBuy').onclick = () => { if (this.game.buySkill(this.selected)) this.refresh(); };
  }

  banner(text: string) {
    const b = $('#banner');
    b.firstElementChild!.textContent = text;
    b.style.opacity = text ? '1' : '0';
    clearTimeout(this.bannerTimer);
    if (text) this.bannerTimer = window.setTimeout(() => (b.style.opacity = '0'), 3200);
  }
  bumpCoins() {
    const c = $('#sCoins').parentElement!;
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }

  private buildTabs() {
    document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach(b => {
      b.onclick = () => {
        document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
        document.querySelectorAll<HTMLElement>('.tab').forEach(t => (t.hidden = t.id !== 'tab-' + b.dataset.tab));
        this.refresh();
      };
    });
  }

  private buildAbilities() {
    const wrap = $('#abilities');
    for (const k of Object.keys(ABILITIES) as AbId[]) {
      const b = el('button', 'ab', '<span class="t"></span><small></small><i class="cd"></i>') as HTMLButtonElement;
      b.onclick = () => { this.game.useAbility(k); this.refresh(); };
      this.abEls.set(k, b); wrap.appendChild(b);
    }
  }

  private buildUpgrades() {
    const wrap = $('#upgrades');
    for (const u of UPGRADES) {
      const b = el('button', 'up', '<span class="n"></span><span class="c"></span><span class="d"></span><i class="bar"></i>') as HTMLButtonElement;
      b.onclick = () => { this.game.buy(u.id); this.refresh(); };
      this.upEls.set(u.id, b); wrap.appendChild(b);
    }
  }

  private upDesc(id: UpId, lv: number) {
    const g = this.game;
    switch (id) {
      case 'size': return `damage ${fmt(g.dropDmg(lv))} → ${fmt(g.dropDmg(lv + 1))}`;
      case 'rate': return `${g.ratePerBeat(lv).toFixed(2)} → ${g.ratePerBeat(lv + 1).toFixed(2)} drops/beat${g.ratePerBeat(lv + 1) > 4 ? ' · merging' : ''}`;
      case 'spouts': return `${1 + lv} → ${2 + lv} drips along the gutter`;
      case 'crit': return `crit chance ${Math.round(g.critChance(lv) * 100)}% → ${Math.round(g.critChance(lv + 1) * 100)}%`;
      case 'splash': return `neighbours take ${lv * 20}% → ${(lv + 1) * 20}%`;
      case 'barrel': return `idle +${fmt(g.barrelRate(lv))}/s → +${fmt(g.barrelRate(lv + 1))}/s`;
    }
  }

  private buildTree() {
    const wrap = $('#tree');
    for (const br of Object.keys(BRANCHES) as Branch[]) {
      const col = el('div', 'branch');
      col.style.setProperty('--bc', BRANCHES[br].color);
      col.appendChild(el('div', 'bname', BRANCHES[br].name));
      SKILLS.filter(s => s.branch === br).forEach((s, i) => {
        if (i) col.appendChild(el('div', 'link'));
        const b = el('button', 'node', `<span class="ic">${s.icon}</span><span class="rk"></span>`) as HTMLButtonElement;
        b.onclick = () => { this.selected = s.id; this.refresh(); };
        this.nodeEls.set(s.id, b); col.appendChild(b);
      });
      wrap.appendChild(col);
    }
  }

  private buildTinker() {
    let wipeArmed = false;
    document.querySelectorAll<HTMLButtonElement>('.tinker button').forEach(b => {
      b.onclick = () => {
        const g = this.game, t = b.dataset.t;
        if (t === 'k') g.gain(1e3);
        if (t === 'm') g.gain(1e6);
        if (t === 'b') g.gain(1e9);
        if (t === 'sh') g.s.shards += 10;
        if (t === 'depth') { g.s.depth += 20; g.initGrid(); }
        if (t === 'storm' && !g.storm.on) g.startStorm();
        if (t === 'snail' && !g.snail) g.spawnSnail();
        if (t === 'speed') { this.speed = this.speed === 1 ? 3 : this.speed === 3 ? 10 : 1; b.textContent = `Speed ${this.speed}×`; }
        if (t === 'wipe') {
          if (!wipeArmed) { wipeArmed = true; b.textContent = 'Tap again to wipe'; setTimeout(() => { wipeArmed = false; b.textContent = 'Wipe save'; }, 3000); return; }
          this.onWipe(); wipeArmed = false; b.textContent = 'Wipe save';
        }
        this.refresh();
      };
    });
  }

  private prestige() {
    if (this.game.shardReward() <= 0) return;
    if (!this.confirmPrestige) { this.confirmPrestige = true; this.refresh(); setTimeout(() => { this.confirmPrestige = false; this.refresh(); }, 3000); return; }
    this.confirmPrestige = false;
    this.game.prestige();
    this.refresh();
  }

  refresh() {
    const g = this.game, s = g.s;
    $('#sCoins').textContent = fmt(s.coins);
    $('#sDepth').textContent = String(s.depth);
    $('#sSeason').textContent = String(s.season + 1);
    $('#sShards').textContent = fmt(s.shards);

    // season bar
    const goal = g.goal(), pct = Math.min(100, (s.depth / goal) * 100);
    $('#seasonText').textContent = s.depth >= goal
      ? `Season ${s.season + 1} · goal reached · deeper = more shards (${g.shardReward()})`
      : `Season ${s.season + 1} · reach depth ${goal} to unlock Clear Skies`;
    ($('#seasonFill') as HTMLElement).style.width = pct + '%';
    $('#seasonBar').classList.toggle('ready', s.depth >= goal);
    $('#treeTab').classList.toggle('dot', SKILLS.some(sk => g.canSkill(sk.id)));

    for (const [k, b] of this.abEls) {
      const d = ABILITIES[k], a = g.ab[k], locked = !s.unlocked[k];
      b.classList.toggle('locked', locked);
      b.classList.toggle('active', a.left > 0);
      b.classList.toggle('armed', k === 'bolt' && g.armed);
      b.querySelector('.t')!.textContent = `${d.icon} ${d.name}`;
      b.querySelector('small')!.textContent = locked ? `unlock 💧${fmt(d.cost)}` : a.left > 0 ? `active ${Math.ceil(a.left)}s` : a.cd > 0 ? `ready in ${Math.ceil(a.cd)}s` : d.desc;
      (b.querySelector('.cd') as HTMLElement).style.width = locked ? '0' : (a.cd > 0 ? 100 * (1 - a.cd / d.cd) : 100) + '%';
      b.disabled = locked ? s.coins < d.cost : a.cd > 0 && !(k === 'bolt' && g.armed);
    }

    let allCapped = true;
    for (const u of UPGRADES) {
      const b = this.upEls.get(u.id)!, lv = s.lv[u.id], cap = g.cap(u.id), maxed = lv >= cap, cost = g.cost(u.id);
      if (!maxed && (u.id === 'size' || u.id === 'rate')) allCapped = false;
      b.classList.toggle('maxed', maxed);
      b.querySelector('.n')!.innerHTML = `${u.name} <small>${lv}/${cap}</small>`;
      b.querySelector('.d')!.textContent = maxed ? 'capped this season' : this.upDesc(u.id, lv);
      b.querySelector('.c')!.textContent = maxed ? 'MAX' : '💧' + fmt(cost);
      (b.querySelector('.bar') as HTMLElement).style.width = (100 * lv / cap) + '%';
      b.disabled = maxed || s.coins < cost;
    }
    $('#capHint').hidden = !allCapped;

    const reward = g.shardReward(), pb = $('#prestigeBtn') as HTMLButtonElement;
    pb.disabled = reward <= 0;
    pb.innerHTML = reward <= 0
      ? `☀ Clear Skies <small>reach depth ${goal} (now ${s.depth})</small>`
      : this.confirmPrestige ? '☀ Tap again to confirm' : `☀ Clear Skies <small>+${reward} rainbow shards</small>`;
    $('#prestigeInfo').innerHTML = `Upgrade levels are <b>halved</b>, every level cap <b>rises</b>, and you start again from the surface with shards for the skill tree. Next season the goal is depth ${goal + 15}.`;

    // tree
    $('#shardCount').textContent = fmt(s.shards);
    for (const [id, b] of this.nodeEls) {
      const d = skillById[id], r = g.sk(id), reqOk = g.skillReqMet(id);
      b.classList.toggle('owned', r > 0);
      b.classList.toggle('maxed', r >= d.max);
      b.classList.toggle('locked', !reqOk);
      b.classList.toggle('can', g.canSkill(id));
      b.classList.toggle('sel', id === this.selected);
      b.querySelector('.rk')!.textContent = d.max >= 999 ? String(r) : `${r}/${d.max}`;
    }
    const d = skillById[this.selected], r = g.sk(d.id), maxed = r >= d.max;
    $('#skillName').innerHTML = `${d.icon} ${d.name} <small style="color:${BRANCHES[d.branch].color}">${BRANCHES[d.branch].name}</small>`;
    $('#skillDesc').textContent = r > 0 ? `Now: ${d.desc(r)}` : d.desc(1);
    $('#skillNext').textContent = maxed ? 'Fully upgraded.' : r > 0 ? `Next: ${d.desc(r + 1)}` : '';
    $('#skillReq').textContent = d.req.length && !g.skillReqMet(d.id) ? `Needs ${d.req.map(q => skillById[q].name).join(d.reqAny ? ' or ' : ' and ')}` : '';
    const buy = $('#skillBuy') as HTMLButtonElement;
    buy.disabled = !g.canSkill(d.id);
    buy.textContent = maxed ? 'Maxed' : `Buy rank ${r + 1} · ✦${skillCost(d, r)}`;

    // stats
    const st = s.stats, h = Math.floor(st.playTime / 3600), m = Math.floor((st.playTime % 3600) / 60);
    $('#statsList').innerHTML = [
      ['Best depth', s.best], ['Seasons cleared', st.seasons], ['Blocks broken', fmt(st.blocks)], ['Treasure chests', st.chests],
      ['Snails bonked', st.snails], ['Best combo', 'x' + st.bestCombo], ['Drops earned', fmt(s.total)], ['Play time', `${h}h ${m}m`],
      ['Damage per drop', fmt(g.dropDmg())], ['Drops per beat', g.curRate().toFixed(2) + ' × ' + g.spouts.length], ['Crit', `${Math.round(g.critChance() * 100)}% · ×${g.critMult()}`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }
}
