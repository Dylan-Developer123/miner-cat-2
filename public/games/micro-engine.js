// Arqade micro games — one shared engine, 10 mechanics, 100 themed variants.
const MICRO_SLUG = window.MICRO_SLUG || '';
const cfg = (window.MICRO_GAMES || []).find(g => g.slug === MICRO_SLUG);
const cvs = document.getElementById('c');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const $ = id => document.getElementById(id);
let state = 'ready', score = 0, submitted = false, G = null;
let pointer = { x: W / 2, y: H / 2 };
let held = {};
let last = performance.now();


const TARGET_MODES = {
  'bug-blaster': 'split', 'star-sniper': 'tiny', 'ufo-zap': 'teleport', 'gem-grab': 'decoys',
  'bubble-pop': 'rise', 'ghost-tap': 'fade', 'apple-aim': 'fall', 'rocket-tap': 'speedup',
  'coin-chase': 'flee', 'frog-flick': 'hop'
};
const TARGET_HOW = {
  'bug-blaster': 'Tap a bug and it splits into two smaller bugs. Pop them all!',
  'star-sniper': 'A tiny star worth 2 points a hit. Precision pays!',
  'ufo-zap': 'The UFO teleports every second. Zap it before it jumps!',
  'gem-grab': "Grab the gems, but don't tap the bombs — they cost 3 points!",
  'bubble-pop': 'Bubbles float up and away. Pop them before they escape!',
  'ghost-tap': "The ghost fades in and out. Tap it while it's solid!",
  'apple-aim': 'Apples rain from the sky. Tap them before they land!',
  'rocket-tap': 'Every hit makes the rocket faster. How long can you keep up?',
  'coin-chase': 'The coin runs from your finger. Corner it and tap it!',
  'frog-flick': 'The frog sits still, then hops! Tap it between jumps or mid-hop.'
};
function howText() { return (cfg && cfg.mechanic === 'target' && TARGET_HOW[cfg.slug]) || (cfg ? cfg.how : ''); }
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function msg(t) { $('msg').textContent = t; }
function scoreText(extra) { $('score').textContent = `Score: ${score}${extra ? ' · ' + extra : ''}`; }
function bg() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, cfg.color2 || '#26264a'); grad.addColorStop(1, '#12121c');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
}
function centerText(text, y, font, fill) {
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = fill || '#fff'; ctx.fillText(text, W / 2, y);
}
function overlay() {
  if (state === 'play') return;
  ctx.fillStyle = 'rgba(8,8,16,.62)'; ctx.fillRect(0, 0, W, H);
  centerText(state === 'ready' ? cfg.icon : '🏁', H / 2 - 34, '52px serif');
  centerText(state === 'ready' ? 'Press Start' : 'Game over', H / 2 + 22, 'bold 28px sans-serif');
}
function start() {
  if (!cfg) return;
  score = 0; submitted = false; state = 'play';
  Engines[cfg.mechanic].setup();
  msg(howText()); scoreText();
}
function finish(final, text) {
  if (state === 'over') return;
  state = 'over'; score = Math.max(0, Math.floor(final)); scoreText(); msg(text);
  if (!submitted) { submitted = true; submitScore(score); }
}

const Engines = {
  target: {
    setup() {
      G = { t: cfg.duration, targets: [], spawnIn: 0, mode: TARGET_MODES[cfg.slug] || 'classic', hits: 0, boost: 1 };
    },
    spawnOne(kind, x, y, r) {
      const mode = G.mode;
      let rad = r || cfg.size;
      if (mode === 'tiny') rad = cfg.size * 0.55;
      if (mode === 'rise') rad = rand(20, 32);
      const tg = { x: 0, y: 0, r: rad, vx: 0, vy: 0, life: 2.4, kind: kind || 'main', ph: rand(0, 6), age: 0, timer: rand(0.7, 1.1) };
      if (x !== undefined) { tg.x = x; tg.y = y; }
      else if (mode === 'fall') { tg.x = rand(rad + 10, W - rad - 10); tg.y = -rad; tg.vy = rand(30, 60); }
      else if (mode === 'rise') { tg.x = rand(rad + 10, W - rad - 10); tg.y = H + rad; tg.vy = -rand(45, 75) * cfg.speed; }
      else {
        tg.x = rand(rad + 12, W - rad - 12); tg.y = rand(rad + 42, H - rad - 12);
        const sp = cfg.speed * (G.boost || 1);
        tg.vx = rand(-55, 55) * sp; tg.vy = rand(-40, 40) * sp;
      }
      if (kind === 'decoy') tg.r = cfg.size * 0.85;
      G.targets.push(tg);
      return tg;
    },
    update(dt) {
      const mode = G.mode;
      G.t -= dt; scoreText(`Time ${Math.max(0, Math.ceil(G.t))}`);
      if (G.t <= 0) return finish(score, `⏰ Time! Final score: ${score}.`);
      const persist = mode === 'teleport' || mode === 'flee' || mode === 'hop';
      const mains = G.targets.filter(x => x.kind === 'main').length;
      const want = (mode === 'rise' || mode === 'fall') ? 3 : 1;
      G.spawnIn -= dt;
      if (mains < want && G.spawnIn <= 0) {
        this.spawnOne('main');
        if (mode === 'decoys' && Math.random() < 0.85) this.spawnOne('decoy');
        G.spawnIn = (mode === 'rise' || mode === 'fall') ? 0.45 : 0.1;
      }
      for (const tg of G.targets) {
        tg.age += dt;
        if (mode === 'fall') {
          tg.vy += 330 * dt; tg.y += tg.vy * dt;
          if (tg.y > H + tg.r) tg.life = 0;
        } else if (mode === 'rise') {
          tg.y += tg.vy * dt; tg.x += Math.sin(tg.age * 3 + tg.ph) * 22 * dt;
          if (tg.y < -tg.r - 4) tg.life = 0;
        } else if (mode === 'teleport') {
          tg.timer -= dt;
          if (tg.timer <= 0) { tg.x = rand(tg.r + 12, W - tg.r - 12); tg.y = rand(tg.r + 42, H - tg.r - 12); tg.timer = 0.95; }
        } else if (mode === 'hop') {
          tg.x += tg.vx * dt; tg.y += tg.vy * dt;
          if (tg.vy !== 0 || tg.y < H - tg.r - 6) tg.vy += 950 * dt;
          if (tg.y >= H - tg.r - 6 && tg.vy >= 0) {
            tg.y = H - tg.r - 6; tg.vy = 0; tg.vx = 0;
            tg.timer -= dt;
            if (tg.timer <= 0) { tg.vx = rand(-150, 150); tg.vy = -rand(270, 390); tg.timer = rand(0.6, 1.2); }
          }
        } else if (mode === 'flee') {
          const dx = tg.x - pointer.x, dy = tg.y - pointer.y, d = Math.hypot(dx, dy) || 1;
          if (d < 135) { tg.vx = dx / d * 155 * cfg.speed; tg.vy = dy / d * 155 * cfg.speed; }
          tg.x += tg.vx * dt; tg.y += tg.vy * dt; tg.vx *= 0.9; tg.vy *= 0.9;
          tg.x = clamp(tg.x, tg.r, W - tg.r); tg.y = clamp(tg.y, tg.r + 30, H - tg.r);
        } else {
          tg.life -= dt;
          tg.x += tg.vx * dt; tg.y += tg.vy * dt;
          if (tg.x < tg.r || tg.x > W - tg.r) tg.vx *= -1;
          if (tg.y < tg.r + 28 || tg.y > H - tg.r) tg.vy *= -1;
        }
      }
      G.targets = G.targets.filter(tg => tg.life > 0);
    },
    tap(x, y) {
      const mode = G.mode;
      for (let i = G.targets.length - 1; i >= 0; i--) {
        const tg = G.targets[i];
        if (Math.hypot(x - tg.x, y - tg.y) > tg.r + 4) continue;
        if (mode === 'fade') {
          const op = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tg.age * 2.4 + tg.ph));
          if (op < 0.45) return; // too faded to catch
        }
        if (tg.kind === 'decoy') {
          score = Math.max(0, score - 3);
          G.targets.splice(i, 1);
          scoreText(`Time ${Math.max(0, Math.ceil(G.t))}`);
          return;
        }
        score += mode === 'tiny' ? 2 : 1;
        G.hits++;
        if (mode === 'speedup') G.boost = 1 + G.hits * 0.07;
        if (mode === 'split' && tg.kind === 'main') {
          const sr = tg.r * 0.62;
          const a = this.spawnOne('small', tg.x - sr, tg.y, sr);
          const b = this.spawnOne('small', tg.x + sr, tg.y, sr);
          a.vx = rand(-90, -30); a.vy = rand(-60, 60); a.life = 1.7;
          b.vx = rand(30, 90); b.vy = rand(-60, 60); b.life = 1.7;
        }
        G.targets.splice(i, 1);
        G.spawnIn = Math.min(G.spawnIn, 0.06);
        scoreText(`Time ${Math.max(0, Math.ceil(G.t))}`);
        return;
      }
    },
    draw() {
      bg();
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(0, 0, W * clamp(G.t / cfg.duration, 0, 1), 8);
      if (!G.targets.length) centerText('…', H / 2, '42px serif', 'rgba(255,255,255,.5)');
      for (const tg of G.targets) {
        let alpha = 1;
        if (G.mode === 'fade') alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(tg.age * 2.4 + tg.ph));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = tg.kind === 'decoy' ? '#7f1d1d' : cfg.color;
        ctx.beginPath(); ctx.arc(tg.x, tg.y, tg.r, 0, 7); ctx.fill();
        ctx.font = `${Math.round(tg.r * 1.05)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(tg.kind === 'decoy' ? '💣' : cfg.icon, tg.x, tg.y + 1);
        ctx.globalAlpha = 1;
      }
      overlay();
    }
  },

  reaction: {
    setup() { G = { round: 1, total: 0, phase: 'wait', at: performance.now() + rand(1000, 2600), goAt: 0 }; },
    update() {
      scoreText(`Round ${G.round}/5`);
      if (G.phase === 'wait' && performance.now() >= G.at) { G.phase = 'go'; G.goAt = performance.now(); }
    },
    tap() {
      const now = performance.now();
      if (G.phase === 'wait') {
        G.total += 1000; msg('Too soon! +1000 ms penalty — wait for green.'); G.at = now + rand(1000, 2400); return;
      }
      if (G.phase !== 'go') return;
      const ms = Math.round(now - G.goAt); G.total += ms;
      if (G.round >= 5) {
        const avg = G.total / 5;
        return finish(Math.max(50, Math.round(1200 - avg)), `⚡ Average reaction: ${Math.round(avg)} ms across 5 rounds.`);
      }
      G.round++; G.phase = 'wait'; G.at = now + rand(1000, 2600);
      msg(`⚡ ${ms} ms! Get ready again…`);
    },
    draw() {
      ctx.fillStyle = state !== 'play' ? '#26264a' : (G.phase === 'go' ? '#15803d' : '#7f1d1d'); ctx.fillRect(0, 0, W, H);
      centerText(G.phase === 'go' ? 'TAP!' : 'WAIT…', H / 2 - 12, 'bold 52px sans-serif');
      centerText(`Round ${G.round} of 5`, H / 2 + 42, '20px sans-serif', 'rgba(255,255,255,.8)');
      overlay();
    }
  },

  dodge: {
    setup() { G = { t: 0, lives: 3, px: W / 2, haz: [], spawn: 0, inv: 0 }; },
    update(dt) {
      G.t += dt; score = Math.floor(G.t * 10); G.inv = Math.max(0, G.inv - dt);
      if (held.ArrowLeft) G.px -= 310 * dt;
      if (held.ArrowRight) G.px += 310 * dt;
      G.px = clamp(G.px, 24, W - 24);
      G.spawn -= dt;
      if (G.spawn <= 0) { G.spawn = 0.72 / cfg.speed; G.haz.push({ x: rand(18, W - 18), y: -22, r: rand(13, 20), vy: rand(125, 175) * cfg.speed }); }
      for (const h of G.haz) {
        h.y += h.vy * dt;
        if (G.inv <= 0 && h.y > H - 78 && h.y < H - 12 && Math.abs(h.x - G.px) < h.r + 22) {
          G.lives--; G.inv = 1.1; h.y = H + 60;
          if (G.lives <= 0) return finish(score, `💥 Caught by a hazard after ${G.t.toFixed(1)} seconds. Score: ${score}`);
        }
      }
      G.haz = G.haz.filter(h => h.y < H + 30);
      scoreText(`Time ${G.t.toFixed(1)} · Lives ${G.lives}`);
      if (G.t >= cfg.duration) finish(score + 50, `🏆 You survived the full ${cfg.duration} seconds! Final score: ${score + 50}`);
    },
    tap() {},
    draw() {
      bg(); ctx.fillStyle = '#2c2c48'; ctx.fillRect(0, H - 54, W, 54);
      for (const h of G.haz) { ctx.font = `${h.r * 2}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☄️', h.x, h.y); }
      ctx.globalAlpha = G.inv > 0 && Math.floor(performance.now() / 120) % 2 ? 0.35 : 1;
      ctx.font = '40px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cfg.icon, G.px, H - 30);
      ctx.globalAlpha = 1; overlay();
    }
  },

  catch: {
    setup() { G = { t: cfg.duration, bx: W / 2, items: [], spawn: 0, lives: 3 }; },
    update(dt) {
      G.t -= dt;
      if (held.ArrowLeft) G.bx -= 330 * dt;
      if (held.ArrowRight) G.bx += 330 * dt;
      G.bx = clamp(G.bx, 46, W - 46);
      G.spawn -= dt;
      if (G.spawn <= 0) { G.spawn = 0.62 / cfg.speed; G.items.push({ x: rand(22, W - 22), y: -22, vy: rand(110, 155) * cfg.speed, bad: Math.random() < 0.18 }); }
      for (const it of G.items) {
        it.y += it.vy * dt;
        if (it.y > H - 66 && it.y < H - 18 && Math.abs(it.x - G.bx) < 52) {
          if (it.bad) G.lives--; else score++;
          it.y = H + 80;
        } else if (it.y > H + 18) {
          if (!it.bad) G.lives--;
          it.y = H + 80;
        }
      }
      G.items = G.items.filter(it => it.y < H + 50);
      scoreText(`Time ${Math.max(0, Math.ceil(G.t))} · Lives ${G.lives}`);
      if (G.lives <= 0) return finish(score, `💥 Three misses! You caught ${score} prizes.`);
      if (G.t <= 0) finish(score, `⏰ Time! You caught ${score} prizes.`);
    },
    tap() {},
    draw() {
      bg(); ctx.fillStyle = '#2c2c48'; ctx.fillRect(0, H - 54, W, 54);
      ctx.font = '30px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const it of G.items) ctx.fillText(it.bad ? '💣' : cfg.icon, it.x, it.y);
      ctx.font = '44px serif'; ctx.fillText('🧺', G.bx, H - 28);
      overlay();
    }
  },

  timing: {
    setup() { G = { attempt: 1, pos: 30, dir: 1, center: rand(100, W - 100), width: 100 / Math.sqrt(cfg.speed) }; },
    update(dt) {
      G.pos += G.dir * 265 * cfg.speed * dt;
      if (G.pos > W - 30) { G.pos = W - 30; G.dir = -1; }
      if (G.pos < 30) { G.pos = 30; G.dir = 1; }
      scoreText(`Attempt ${G.attempt}/8`);
    },
    tap() {
      const pts = Math.max(0, Math.round(100 - Math.abs(G.pos - G.center) * 1.35));
      score += pts;
      if (G.attempt >= 8) return finish(score, `🎯 Timing complete! Final score: ${score} of 800.`);
      G.attempt++; G.center = rand(100, W - 100); G.pos = 30; G.dir = 1;
      msg(`+${pts} points! Stop closer to the center for more.`);
      scoreText(`Attempt ${G.attempt}/8`);
    },
    draw() {
      bg(); centerText('Stop the marker in the gold zone', 74, 'bold 21px sans-serif');
      ctx.fillStyle = '#33334f'; ctx.fillRect(30, H / 2 - 18, W - 60, 36);
      ctx.fillStyle = '#f5c542'; ctx.fillRect(G.center - G.width / 2, H / 2 - 18, G.width, 36);
      ctx.fillStyle = '#fff'; ctx.fillRect(G.pos - 4, H / 2 - 34, 8, 68);
      ctx.beginPath(); ctx.arc(G.pos, H / 2 - 44, 10, 0, 7); ctx.fill();
      centerText(`Attempt ${G.attempt} of 8`, H - 72, '19px sans-serif', 'rgba(255,255,255,.8)');
      overlay();
    }
  },

  mash: {
    setup() { G = { t: cfg.duration }; },
    update(dt) { G.t -= dt; scoreText(`Time ${Math.max(0, G.t).toFixed(1)}`); if (G.t <= 0) finish(score, `⏰ Time! ${score} taps.`); },
    tap(x, y) { if (Math.hypot(x - W / 2, y - H / 2) <= 112) { score++; scoreText(`Time ${Math.max(0, G.t).toFixed(1)}`); } },
    draw() {
      bg();
      ctx.fillStyle = cfg.color; ctx.beginPath(); ctx.arc(W / 2, H / 2, 108, 0, 7); ctx.fill();
      ctx.font = '62px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cfg.icon, W / 2, H / 2 - 22);
      centerText(String(score), H / 2 + 48, 'bold 38px sans-serif', '#191920');
      overlay();
    }
  },

  color: {
    setup() { G = { t: cfg.duration, streak: 0 }; this.newRound(); },
    colors: [
      { name: 'RED', hex: '#ef4444' }, { name: 'BLUE', hex: '#3b82f6' },
      { name: 'GREEN', hex: '#22c55e' }, { name: 'YELLOW', hex: '#facc15' }
    ],
    newRound() {
      const word = this.colors[Math.floor(Math.random() * 4)];
      const ink = this.colors[Math.floor(Math.random() * 4)];
      G.current = { word, ink }; G.options = shuffle([...this.colors]);
    },
    update(dt) { G.t -= dt; scoreText(`Time ${Math.max(0, Math.ceil(G.t))} · Streak ${G.streak}`); if (G.t <= 0) finish(score, `⏰ Time! Final color score: ${score}.`); },
    tap(x, y) {
      const w = 112, gap = 10, total = w * 4 + gap * 3, x0 = (W - total) / 2, y0 = 252;
      G.options.forEach((c, i) => {
        const rx = x0 + i * (w + gap);
        if (x >= rx && x <= rx + w && y >= y0 && y <= y0 + 58) {
          if (c.name === G.current.ink.name) { score += 10 + Math.min(10, G.streak); G.streak++; }
          else { score = Math.max(0, score - 5); G.streak = 0; G.t = Math.max(0, G.t - 1); }
          this.newRound();
        }
      });
    },
    draw() {
      bg(); centerText('Tap the COLOR of the ink — not the word!', 52, 'bold 20px sans-serif');
      ctx.font = 'bold 56px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = G.current.ink.hex; ctx.fillText(G.current.word.name, W / 2, 138);
      const w = 112, gap = 10, total = w * 4 + gap * 3, x0 = (W - total) / 2;
      G.options.forEach((c, i) => {
        const rx = x0 + i * (w + gap);
        ctx.fillStyle = c.hex; ctx.fillRect(rx, 252, w, 58);
        ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(c.name, rx + w / 2, 281);
      });
      overlay();
    }
  },

  numbers: {
    setup() { G = { t: cfg.duration, round: 1, next: 1, max: 12, found: new Set() }; this.layout(); },
    layout() {
      const vals = shuffle(Array.from({ length: G.max }, (_, i) => i + 1));
      G.items = vals.map((v, i) => ({ v, x: 75 + (i % 4) * 124 + rand(-10, 10), y: 82 + Math.floor(i / 4) * 88 + rand(-8, 8) }));
    },
    update(dt) { G.t -= dt; scoreText(`Next ${G.next} · Round ${G.round} · Time ${Math.max(0, Math.ceil(G.t))}`); if (G.t <= 0) finish(score, `⏰ Time! Final number score: ${score}.`); },
    tap(x, y) {
      for (const it of G.items) {
        if (G.found.has(it.v) || Math.hypot(x - it.x, y - it.y) > 27) continue;
        if (it.v === G.next) {
          G.found.add(it.v); G.next++; score += 10;
          if (G.next > G.max) { score += 50; G.round++; G.max = Math.min(16, G.max + 2); G.next = 1; G.found = new Set(); this.layout(); }
        } else score = Math.max(0, score - 3);
        return;
      }
    },
    draw() {
      bg(); centerText(`Tap ${G.next} next`, 34, 'bold 21px sans-serif');
      for (const it of G.items) {
        const found = G.found.has(it.v);
        ctx.fillStyle = found ? '#245c35' : cfg.color; ctx.beginPath(); ctx.arc(it.x, it.y, 26, 0, 7); ctx.fill();
        ctx.font = 'bold 21px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(it.v, it.x, it.y);
      }
      overlay();
    }
  },

  balloons: {
    setup() { G = { t: cfg.duration, bs: [], spawn: 0 }; },
    update(dt) {
      G.t -= dt; G.spawn -= dt;
      if (G.spawn <= 0) { G.spawn = 0.42 / cfg.speed; G.bs.push({ x: rand(34, W - 34), y: H + 36, r: rand(22, 32), vy: rand(58, 88) * cfg.speed, ph: rand(0, 6) }); }
      for (const b of G.bs) { b.y -= b.vy * dt; b.x += Math.sin((b.y + b.ph) * 0.03) * 18 * dt; }
      G.bs = G.bs.filter(b => b.y > -45);
      scoreText(`Time ${Math.max(0, Math.ceil(G.t))}`);
      if (G.t <= 0) finish(score, `⏰ Time! You popped ${score} balloons.`);
    },
    tap(x, y) {
      for (let i = G.bs.length - 1; i >= 0; i--) {
        const b = G.bs[i];
        if (Math.hypot(x - b.x, y - b.y) <= b.r + 5) { G.bs.splice(i, 1); score++; return; }
      }
    },
    draw() {
      bg();
      for (const b of G.bs) {
        ctx.fillStyle = cfg.color; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * 0.82, b.r, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(b.x, b.y + b.r); ctx.quadraticCurveTo(b.x + 8, b.y + b.r + 18, b.x, b.y + b.r + 34); ctx.stroke();
        ctx.font = `${Math.round(b.r)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(cfg.icon, b.x, b.y);
      }
      overlay();
    }
  },

  keys: {
    setup() { G = { t: cfg.duration, streak: 0, prompt: this.randomKey(), zones: [] }; },
    arrows: [
      { k: 'ArrowUp', s: '⬆️' }, { k: 'ArrowLeft', s: '⬅️' },
      { k: 'ArrowDown', s: '⬇️' }, { k: 'ArrowRight', s: '➡️' }
    ],
    randomKey() { return this.arrows[Math.floor(Math.random() * 4)]; },
    answer(k) {
      if (state !== 'play') return;
      if (k === G.prompt.k) { score += 10; G.streak++; G.prompt = this.randomKey(); }
      else { score = Math.max(0, score - 3); G.streak = 0; G.t = Math.max(0, G.t - 1); }
      scoreText(`Time ${Math.max(0, Math.ceil(G.t))} · Streak ${G.streak}`);
    },
    update(dt) { G.t -= dt; scoreText(`Time ${Math.max(0, Math.ceil(G.t))} · Streak ${G.streak}`); if (G.t <= 0) finish(score, `⏰ Time! Final key score: ${score}.`); },
    tap(x, y) { for (const z of G.zones) if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return this.answer(z.k); },
    draw() {
      bg(); centerText('Press or tap the matching arrow', 54, 'bold 21px sans-serif');
      ctx.font = '92px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(G.prompt.s, W / 2, 150);
      G.zones = [];
      const labels = [this.arrows[0], this.arrows[1], this.arrows[2], this.arrows[3]];
      labels.forEach((a, i) => {
        const x = 52 + i * 110, y = 268, w = 88, h = 62;
        G.zones.push({ x, y, w, h, k: a.k });
        ctx.fillStyle = '#26264a'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#55557a'; ctx.strokeRect(x, y, w, h);
        ctx.font = '34px serif'; ctx.fillText(a.s, x + w / 2, y + h / 2 + 1);
      });
      overlay();
    }
  }
};

function canvasPoint(e) {
  const r = cvs.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
}
cvs.addEventListener('pointerdown', e => {
  e.preventDefault(); pointer = canvasPoint(e);
  if (state === 'play' && cfg) Engines[cfg.mechanic].tap(pointer.x, pointer.y);
});
cvs.addEventListener('pointermove', e => { pointer = canvasPoint(e); if (cfg && G && (cfg.mechanic === 'dodge')) G.px = pointer.x; if (cfg && G && cfg.mechanic === 'catch') G.bx = pointer.x; });
addEventListener('keydown', e => {
  held[e.key] = true;
  if (cfg && cfg.mechanic === 'keys' && Engines.keys.arrows.some(a => a.k === e.key)) { e.preventDefault(); Engines.keys.answer(e.key); }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
});
addEventListener('keyup', e => { held[e.key] = false; });
$('start').onclick = start;
$('restart').onclick = start;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, Math.max(0, (now - last) / 1000 || 0)); last = now;
  if (!cfg || !G) { ctx.fillStyle = '#18182a'; ctx.fillRect(0, 0, W, H); centerText('Game not found', H / 2, 'bold 24px sans-serif'); return; }
  if (state === 'play') Engines[cfg.mechanic].update(dt);
  Engines[cfg.mechanic].draw();
}

// --- Site account (the Miner Cat account works everywhere) ---
{ const s = document.createElement('script'); s.src = '/games/admin-panel.js'; document.body.appendChild(s); }
let ME = null;
const esc = s => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const GAME_KEY = cfg ? 'micro-' + cfg.slug : '';
async function loadLb() {
  if (!cfg) return;
  try {
    const d = await (await fetch('/api/scores/' + GAME_KEY)).json();
    $('lb').innerHTML = '<b>🏆 Leaderboard</b>' + (d.scores.length ? d.scores.map((s, i) => `<br>${i + 1}. ${esc(s.displayName)} — ${s.score}`).join('') : '<br>No scores yet — be the first!');
  } catch (e) {}
}
async function submitScore(s) {
  if (!ME || !cfg || !s) return;
  try { await fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: GAME_KEY, score: s }) }); loadLb(); } catch (e) {}
}
(async () => {
  if (!cfg) { msg('This game could not be found.'); return; }
  document.title = `${cfg.name} — Arqade`;
  $('game-title').textContent = `${cfg.icon} ${cfg.name}`;
  msg(howText()); scoreText();
  Engines[cfg.mechanic].setup();
  try { const r = await fetch('/api/me'); if (r.ok) ME = (await r.json()).user; } catch (e) {}
  $('acct').innerHTML = ME ? `👤 Playing as <b>${esc(ME.displayName)}</b> — your best score saves to your account` : '👤 <a href="/miner-cat-2" style="color:#f5c542;">Sign in</a> to save scores to your account';
  loadLb();
})();
requestAnimationFrame(frame);
