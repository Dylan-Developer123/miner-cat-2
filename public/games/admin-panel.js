// Arqade shared admin panel — appears on every game page for admin-tagged accounts.
// All powers are enforced server-side by POST /api/admin; this is just the UI.
(async () => {
  let user = null;
  try {
    const r = await fetch('/api/me');
    if (!r.ok) return;
    user = (await r.json()).user;
  } catch (e) { return; }
  if (!user || !(user.isAdmin || user.isModerator || user.isDeveloper || user.isOwner)) return;

  const css = `
  #arq-admin-btn { position: fixed; right: 14px; bottom: 14px; z-index: 99998; background: #f5c542; color: #191920; border: none; border-radius: 24px; padding: 10px 16px; font-size: 15px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.5); font-family: 'Segoe UI', system-ui, sans-serif; }
  #arq-admin { position: fixed; right: 14px; bottom: 62px; z-index: 99999; width: min(336px, 94vw); max-height: 78vh; overflow-y: auto; background: #1e1e30; color: #eee; border: 2px solid #f5c542; border-radius: 14px; padding: 14px; font-family: 'Segoe UI', system-ui, sans-serif; box-shadow: 0 10px 34px rgba(0,0,0,.6); }
  #arq-admin h3 { font-size: 17px; margin: 0 0 2px; }
  #arq-admin h4 { font-size: 12px; letter-spacing: .6px; opacity: .65; margin: 14px 0 6px; text-transform: uppercase; }
  #arq-admin .who { font-size: 12.5px; opacity: .75; margin-bottom: 4px; }
  #arq-admin .row { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  #arq-admin button { background: #fff; color: #191920; border: 1px solid #bbb; border-radius: 8px; padding: 7px 10px; font-size: 13.5px; font-weight: 700; cursor: pointer; }
  #arq-admin button.danger { border-color: #d9534f; color: #a33; }
  #arq-admin input, #arq-admin select { flex: 1; min-width: 0; background: #12121c; color: #eee; border: 1px solid #55557a; border-radius: 8px; padding: 7px 9px; font-size: 13.5px; }
  #arq-admin #arq-status { font-size: 13px; min-height: 18px; margin-top: 8px; color: #ffd95e; }
  #arq-admin .game-row { display: flex; align-items: center; gap: 6px; margin-bottom: 5px; }
  #arq-admin .game-row span { flex: 1; font-size: 13.5px; }
  #arq-admin .game-row button { padding: 5px 9px; font-size: 12.5px; }
  #arq-admin .close { float: right; background: none; border: none; color: #eee; font-size: 17px; cursor: pointer; padding: 0 2px; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'arq-admin-btn';
  btn.textContent = '🔧 Admin';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'arq-admin';
  panel.style.display = 'none';
  panel.innerHTML = `
    <button class="close" title="Close">✕</button>
    <h3>🔧 Admin panel</h3>
    <div class="who">Signed in as <b></b> — one account for the whole site. Each game has its own panel below.</div>
    <h4>⛏️ Miner Cat 2</h4>
    <div class="row">
      <button data-cmd="coins">+1M coins</button>
      <button data-cmd="gems">+100 gems</button>
      <button data-cmd="god">God mode</button>
    </div>
    <div class="row">
      <button data-cmd="heal">Heal</button>
      <button data-cmd="upgrades">Max upgrades</button>
      <button data-cmd="achievements">All achievements</button>
      <button data-cmd="stage100">Go to stage 100</button>
    </div>
    <div class="row" style="margin-top:8px;"><input id="arq-gift-user" placeholder="🎁 Gift to (username)"></div>
    <div class="row">
      <input id="arq-gift-coins" type="number" min="0" placeholder="🪙 Coins">
      <input id="arq-gift-gems" type="number" min="0" placeholder="💎 Gems">
      <button id="arq-gift-btn">🎁 Gift</button>
    </div>
    <div class="row" style="margin-top:8px;">
      <input id="arq-reset" placeholder="Username to reset">
      <button id="arq-reset-btn" class="danger">Reset progress</button>
    </div>
    <div class="row"><button id="arq-reset-self" class="danger">Reset MY progress</button></div>
    <h4>🚓 City Pursuit 3D</h4>
    <div id="arq-game-hooks"></div>
    <div class="game-row"><span>🏆 My best cash haul</span><button data-score-game="pursuit3d">Reset</button></div>
    <h4>🎮 More games — my best scores</h4>
    <div id="arq-more-games"></div>
    <h4>Broadcast</h4>
    <div class="row">
      <input id="arq-broadcast" placeholder="Global message…" maxlength="500">
      <button id="arq-broadcast-btn">📢 Send</button>
    </div>
    <h4>Ban / unban</h4>
    <div class="row">
      <input id="arq-ban" placeholder="Username">
      <button id="arq-ban-btn" class="danger">Ban</button>
      <button id="arq-unban-btn">Unban</button>
    </div>
    ${user.canGiveTags ? `
    <h4>🏷️ Give / remove tags (owner)</h4>
    <div class="row">
      <input id="arq-tag-user" placeholder="Username for tag">
      <select id="arq-tag-select" style="flex:0 0 auto;">
        <option value="admin">🛠️ Admin</option>
        <option value="moderator">🛡️ Moderator</option>
        <option value="developer">💻 Developer</option>
      </select>
    </div>
    <div class="row">
      <button id="arq-tag-grant">Give tag</button>
      <button id="arq-tag-revoke">Remove tag</button>
    </div>` : ''}
    <h4>Danger zone</h4>
    <div class="row"><button id="arq-wipe" class="danger">Delete ALL accounts</button></div>
    <div id="arq-status"></div>`;
  document.body.appendChild(panel);
  panel.querySelector('.who b').textContent = user.displayName;
  const status = msg => { panel.querySelector('#arq-status').textContent = msg; };
  const val = id => panel.querySelector(id).value.trim();

  async function admin(command, extra) {
    const r = await fetch('/api/admin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, ...(extra || {}) }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'That did not work.');
    return d;
  }

  btn.onclick = () => { renderHooks(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; };
  panel.querySelector('.close').onclick = () => { panel.style.display = 'none'; };

  panel.querySelectorAll('[data-cmd]').forEach(b => {
    b.onclick = async () => {
      const cmd = b.dataset.cmd;
      const extra = cmd === 'coins' ? { amount: 1000000 } : cmd === 'gems' ? { amount: 100 } : cmd === 'upgrades' ? { pick: 50, armor: 50, bag: 50 } : {};
      try { await admin(cmd, extra); status('✅ Done — Miner Cat 2 updated.'); }
      catch (ex) { status('⚠️ ' + ex.message); }
    };
  });
  panel.querySelector('#arq-broadcast-btn').onclick = async () => {
    const message = val('#arq-broadcast');
    try { await admin('broadcast', { message }); panel.querySelector('#arq-broadcast').value = ''; status(message ? '📢 Broadcast sent!' : '📢 Broadcast cleared.'); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };
  async function ban(banFlag) {
    const target = val('#arq-ban');
    if (!target) return status('Enter a username.');
    if (!confirm(`${banFlag ? 'Ban' : 'Unban'} "${target}"?`)) return;
    try { const r = await admin(banFlag ? 'ban' : 'unban', { target }); status(r.banned ? `🚫 Banned ${r.username}.` : `✅ Unbanned ${r.username}.`); panel.querySelector('#arq-ban').value = ''; }
    catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-ban-btn').onclick = () => ban(true);
  panel.querySelector('#arq-unban-btn').onclick = () => ban(false);
  panel.querySelector('#arq-gift-btn').onclick = async () => {
    const target = val('#arq-gift-user');
    const coins = Number(panel.querySelector('#arq-gift-coins').value) || 0;
    const gems = Number(panel.querySelector('#arq-gift-gems').value) || 0;
    if (!target) return status('Enter a username.');
    try { const r = await admin('gift', { target, coins, gems }); status(`🎁 Gave ${r.coins} coins and ${r.gems} gems to ${r.username}.`); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };
  async function reset(target, isSelf) {
    const label = isSelf ? 'your own' : `"${target}"'s`;
    if (!confirm(`Reset ${label} progress? Coins, gems, upgrades, achievements — everything. Cannot be undone.`)) return;
    if (!confirm(`Really wipe ${label} progress?`)) return;
    try {
      const r = await admin('reset', { target: isSelf ? user.username : target });
      status(`🔄 Reset ${r.username}'s progress.`);
      if (r.self) location.reload();
    } catch (ex) { status('⚠️ ' + ex.message); }
  }
  panel.querySelector('#arq-reset-btn').onclick = () => { const t = val('#arq-reset'); if (t) reset(t, false); else status('Enter a username.'); };
  panel.querySelector('#arq-reset-self').onclick = () => reset(null, true);
  if (user.canGiveTags) {
    async function changeTag(grant) {
      const target = val('#arq-tag-user');
      const tag = panel.querySelector('#arq-tag-select').value;
      if (!target) return status('Enter a username.');
      if (!confirm(`${grant ? 'GIVE' : 'REMOVE'} the ${tag.toUpperCase()} tag ${grant ? 'to' : 'from'} "${target}"?`)) return;
      try {
        const r = await admin('tag', { target, tag, grant });
        status(r.granted ? `🏷️ Gave the ${r.tag} tag to ${r.username}!` : `🏷️ Removed the ${r.tag} tag from ${r.username}.`);
        panel.querySelector('#arq-tag-user').value = '';
      } catch (ex) { status('⚠️ ' + ex.message); }
    }
    panel.querySelector('#arq-tag-grant').onclick = () => changeTag(true);
    panel.querySelector('#arq-tag-revoke').onclick = () => changeTag(false);
  }
  const MORE_GAMES = [
    ['🐍 Snake', 'snake'], ['🧱 Breakout', 'breakout'], ['🐤 Flappy Bird', 'flappy'],
    ['🃏 Memory Match', 'memory'], ['🔢 2048', '2048'], ['🪙 Coin Clicker', 'clicker'],
    ['🏓 Pong', 'pong'], ['💣 Minesweeper', 'minesweeper'], ['👾 Space Invaders', 'invaders'],
    ['🌕 Lunar Lander', 'lander'], ['🏎️ Turbo Racer', 'racer'], ['🂡 Blackjack', 'blackjack'],
    ['✏️ Word Guess', 'word'],
  ];
  const moreEl = panel.querySelector('#arq-more-games');
  for (const [name, key] of MORE_GAMES) {
    const row = document.createElement('div');
    row.className = 'game-row';
    row.innerHTML = '<span></span><button>Reset</button>';
    row.querySelector('span').textContent = name;
    row.querySelector('button').dataset.scoreGame = key;
    moreEl.appendChild(row);
  }
  panel.querySelectorAll('[data-score-game]').forEach(b => {
    b.onclick = async () => {
      const game = b.dataset.scoreGame;
      if (!confirm('Reset your best score in this game? Cannot be undone.')) return;
      try { await admin('resetScore', { game }); status('🏆 Best score cleared — fresh start next game!'); }
      catch (ex) { status('⚠️ ' + ex.message); }
    };
  });
  // Live in-game powers: a game page can register window.ARQ_GAME_ADMIN = { actions: [{label, run}] }.
  let hooksBuilt = false;
  function renderHooks() {
    if (hooksBuilt) return;
    const hooks = window.ARQ_GAME_ADMIN;
    const box = panel.querySelector('#arq-game-hooks');
    if (!hooks || !Array.isArray(hooks.actions) || !hooks.actions.length) {
      box.innerHTML = '<div class="who">Open this panel inside City Pursuit 3D for live powers (cash, wanted, repairs).</div>';
      return;
    }
    hooksBuilt = true;
    box.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'row';
    for (const a of hooks.actions) {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.onclick = () => { try { const m = a.run(); status(m || '✅ Done.'); } catch (ex) { status('⚠️ ' + ex.message); } };
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  renderHooks();
  panel.querySelector('#arq-wipe').onclick = async () => {
    if (!confirm('Delete ALL accounts and all saved progress? This cannot be undone.')) return;
    if (!confirm('Really wipe everything? You will be signed out.')) return;
    try { await admin('wipe', {}); location.reload(); }
    catch (ex) { status('⚠️ ' + ex.message); }
  };
})();
