import './style.css';
import { H, ROWS, SAVE_KEY, W } from './config';
import { Audio } from './audio';
import { fmt } from './font';
import { Game, newSave, type Save } from './game';
import { Renderer } from './render';
import { UI } from './ui';

function load(): Save | undefined {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!raw || raw.v !== 2 || !Array.isArray(raw.grid) || raw.grid.length !== ROWS) return undefined;
    const d = newSave();
    return { ...d, ...raw, lv: { ...d.lv, ...raw.lv }, skills: { ...raw.skills }, unlocked: { ...d.unlocked, ...raw.unlocked }, stats: { ...d.stats, ...raw.stats } };
  } catch { return undefined; }
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = W; canvas.height = H;
const game = new Game(load());
const audio = new Audio();
let renderer: Renderer;
const ui = new UI(game);

let offline = 0;
if (game.s.saved) {
  offline = game.offlineGain((Date.now() - game.s.saved) / 1000);
  if (offline > 0) game.gain(offline);
}

function wire(g: Game) {
  g.on(e => {
    audio.handle(e, g.beatLen());
    if (e.type === 'banner') ui.banner(e.text);
    if (e.type === 'prestige') ui.banner(`☀ Clear skies. +${e.shards} rainbow shards, spend them in the Skill Tree`);
  });
  renderer = new Renderer(canvas, g);
  renderer.onMote = () => { ui.bumpCoins(); audio.moteTick(); };
}
wire(game);

let wiping = false;
function save() { if (wiping) return; try { game.s.saved = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(game.s)); } catch { /* storage unavailable */ } }
setInterval(save, 5000);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { audio.suspend(document.hidden); if (document.hidden) save(); });

ui.onWipe = () => {
  wiping = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  location.reload();
};

canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  game.tap(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
});

const start = document.getElementById('start')!;
start.addEventListener('click', async () => {
  start.style.display = 'none';
  try { await audio.start(); } catch { /* audio blocked: play silently */ }
  if (offline > 1) ui.banner(`While you were away, the barrel collected +${fmt(offline)} drops`);
});
document.getElementById('tMusic')!.onclick = e => { const b = e.currentTarget as HTMLButtonElement; audio.setMusic(!audio.musicOn); b.textContent = '♪ ' + (audio.musicOn ? 'on' : 'off'); };
document.getElementById('tSfx')!.onclick = e => { const b = e.currentTarget as HTMLButtonElement; audio.setSfx(!audio.sfxOn); b.textContent = '🔊 ' + (audio.sfxOn ? 'on' : 'off'); };

setInterval(() => ui.refresh(), 150);
ui.refresh();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000) * ui.speed;
  last = now;
  game.update(dt);
  renderer.update(dt);
  renderer.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for tinkering in the console
Object.assign(window, { game });
