// Invite All – content script for facebook.com
// Finds the event "Invite" dialog and ticks every follower checkbox, scrolling
// to load more, until the list ends, the invite limit is hit, or you press stop.
(() => {
  // If an older copy of this script is still alive (e.g. after reloading the
  // extension), tell it to shut down so only one instance runs.
  const TAKEOVER_EVENT = 'invite-all:takeover';
  document.dispatchEvent(new CustomEvent(TAKEOVER_EVENT));

  const DEFAULTS = {
    clickDelay: 20,    // ms between checkbox clicks
    loadTimeout: 6000, // max ms to wait for Facebook to load the next batch (~0.6s normally)
    idleRounds: 2,     // failed load attempts in a row before deciding the list ended
    maxSelect: 0,      // 0 = no limit (Facebook's own limit still applies)
    showPanel: true,   // floating panel next to the invite dialog
  };

  let settings = { ...DEFAULTS };
  const state = {
    phase: 'idle', // idle | running | done | stopped | error
    selected: 0,
    invitesLeft: null,
    message: '',
    dialogFound: false,
  };
  let stopRequested = false;
  let dismissed = false;
  let alive = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Facebook DOM helpers ----------

  const INVITE_HINT = /invite|הזמנ/i;

  function findInviteDialog() {
    let best = null;
    let bestCount = 0;
    for (const d of document.querySelectorAll('[role="dialog"]')) {
      const count = d.querySelectorAll('[role="checkbox"]').length;
      if (count > bestCount && INVITE_HINT.test(d.textContent)) {
        best = d;
        bestCount = count;
      }
    }
    return best;
  }

  const LEFT_PATTERNS = [
    /(\d[\d,]*)\s*invites?\s*left/i,
    /נותרו\s*(\d[\d,]*)\s*הזמנות/,
    /(\d[\d,]*)\s*הזמנות\s*נותרו/,
  ];

  function getInvitesLeft(dialog) {
    const text = dialog.textContent;
    for (const re of LEFT_PATTERNS) {
      const m = text.match(re);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10);
    }
    return null;
  }

  function getScrollContainer(dialog) {
    const first = dialog.querySelector('[role="checkbox"]');
    if (!first) return null;
    let fallback = null;
    for (let el = first.parentElement; el && el !== dialog; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 50) {
        if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el;
        fallback ??= el;
      }
    }
    return fallback || dialog;
  }

  const isPending = (cb, clicked) =>
    cb.getAttribute('aria-checked') === 'false' &&
    cb.getAttribute('aria-disabled') !== 'true' &&
    !clicked.has(cb);

  const hasPending = (dialog, clicked) =>
    [...dialog.querySelectorAll('[role="checkbox"]')].some((cb) => isPending(cb, clicked));

  // Facebook shows a "Loading..." element at the bottom of the list while it fetches more.
  const isLoading = (dialog) =>
    !!dialog.querySelector('[data-visualcompletion="loading-state"], [role="progressbar"]');

  function scrollToBottom(dialog) {
    const scroller = getScrollContainer(dialog);
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  // Scroll to the bottom and wait until new people show up.
  // Returns true if more people loaded, false if the list seems to have ended.
  async function loadMore(dialog, clicked) {
    const before = dialog.querySelectorAll('[role="checkbox"]').length;
    scrollToBottom(dialog);
    const start = Date.now();
    while (Date.now() - start < settings.loadTimeout) {
      await sleep(100);
      if (stopRequested || !alive || !dialog.isConnected) return false;
      const now = dialog.querySelectorAll('[role="checkbox"]').length;
      if (now > before || hasPending(dialog, clicked)) return true;
      // Nothing is loading and nothing new after a moment -> end of the list.
      if (!isLoading(dialog) && Date.now() - start > 1500) return false;
      scrollToBottom(dialog); // keep nudging in case the list grew/re-rendered
    }
    return false;
  }

  // ---------- Main loop ----------

  async function run() {
    if (state.phase === 'running') return;
    const dialog = findInviteDialog();
    if (!dialog) {
      update({ phase: 'error', message: 'לא נמצא חלון הזמנות. פתח את האירוע ולחץ על Invite.' });
      return;
    }

    stopRequested = false;
    dismissed = false;
    const clicked = new WeakSet();
    let selected = 0;
    let idle = 0;
    update({ phase: 'running', selected: 0, invitesLeft: getInvitesLeft(dialog), message: 'מסמן אנשים…' });

    const limitReached = () => {
      const left = getInvitesLeft(dialog);
      state.invitesLeft = left;
      return left === 0 || (settings.maxSelect > 0 && selected >= settings.maxSelect);
    };

    outer: while (!stopRequested && alive) {
      if (!dialog.isConnected) {
        update({ phase: 'error', message: `חלון ההזמנות נסגר באמצע. סומנו ${selected}.` });
        return;
      }
      if (limitReached()) break;

      const batch = [...dialog.querySelectorAll('[role="checkbox"]')].filter((cb) => isPending(cb, clicked));
      for (const cb of batch) {
        if (stopRequested || !alive || limitReached()) break outer;
        if (!cb.isConnected || cb.getAttribute('aria-checked') !== 'false') continue;
        cb.click();
        clicked.add(cb);
        selected++;
        update({ selected });
        await sleep(settings.clickDelay);
      }

      if (stopRequested || !alive || limitReached()) break;

      // Scroll to the bottom and wait for Facebook to load the next chunk of people.
      update({ message: 'טוען עוד אנשים…' });
      const more = await loadMore(dialog, clicked);
      if (more) {
        idle = 0;
        update({ message: 'מסמן אנשים…' });
      } else if (++idle >= settings.idleRounds) {
        break;
      }
    }

    const left = dialog.isConnected ? getInvitesLeft(dialog) : state.invitesLeft;
    const leftText = left === null ? '' : ` נותרו ${left} הזמנות.`;
    if (stopRequested) {
      update({ phase: 'stopped', invitesLeft: left, message: `נעצר. סומנו ${selected} אנשים.${leftText}` });
    } else {
      const why = left === 0 ? 'הגעת למגבלת ההזמנות של פייסבוק.' : settings.maxSelect > 0 && selected >= settings.maxSelect ? 'הגעת למקסימום שהגדרת.' : 'הרשימה נגמרה.';
      update({
        phase: 'done',
        invitesLeft: left,
        message: `בוצע! סומנו ${selected} אנשים. ${why}${leftText} עכשיו לחץ על "Send invites".`,
      });
    }
  }

  function stop() {
    stopRequested = true;
  }

  // ---------- Floating panel (Shadow DOM so Facebook's CSS can't touch it) ----------

  const host = document.createElement('div');
  host.id = 'invite-all-extension-host';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; bottom: 24px; left: 24px;';
  // Keep clicks on the panel from reaching Facebook (which could close the dialog).
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'click', 'keydown']) {
    host.addEventListener(ev, (e) => e.stopPropagation());
  }
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Heebo", Arial, sans-serif; }
      .card {
        --bg: #ffffff; --fg: #1c1e21; --muted: #65676b; --line: #e4e6eb;
        --accent: #6d4aff; --accent2: #e8457c; --stop: #e0245e;
        width: 264px; padding: 14px; border-radius: 16px; background: var(--bg); color: var(--fg);
        box-shadow: 0 12px 40px rgba(0,0,0,.22), 0 2px 6px rgba(0,0,0,.08);
        border: 1px solid var(--line); direction: rtl; animation: pop .18s ease-out;
      }
      @media (prefers-color-scheme: dark) {
        .card { --bg: #242526; --fg: #e4e6eb; --muted: #b0b3b8; --line: #3a3b3c; }
      }
      @keyframes pop { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
      .logo { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: #fff; font-weight: 700; font-size: 18px;
              background: linear-gradient(135deg, var(--accent), var(--accent2)); }
      .title { font-weight: 700; font-size: 14px; flex: 1; }
      .x { all: unset; cursor: pointer; color: var(--muted); font-size: 18px; line-height: 1; padding: 2px 6px; border-radius: 6px; }
      .x:hover { background: var(--line); }
      .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
      .stat { background: color-mix(in srgb, var(--line) 55%, transparent); border-radius: 12px; padding: 8px 10px; }
      .num { display: block; font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .lbl { font-size: 11px; color: var(--muted); }
      .bar { height: 4px; border-radius: 4px; background: var(--line); overflow: hidden; margin-bottom: 10px; visibility: hidden; }
      .bar i { display: block; height: 100%; width: 40%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), var(--accent2));
               animation: slide 1s ease-in-out infinite; }
      .running .bar { visibility: visible; }
      @keyframes slide { from { transform: translateX(160%); } to { transform: translateX(-260%); } }
      .msg { font-size: 12px; color: var(--muted); min-height: 16px; margin-bottom: 10px; line-height: 1.45; }
      .done .msg { color: #1a7f37; } .error .msg { color: var(--stop); }
      @media (prefers-color-scheme: dark) { .done .msg { color: #4ac26b; } }
      .go { all: unset; display: block; width: 100%; text-align: center; padding: 10px 0; border-radius: 10px; cursor: pointer;
            font-weight: 700; font-size: 14px; color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent2));
            transition: filter .15s, transform .05s; }
      .go:hover { filter: brightness(1.08); } .go:active { transform: scale(.98); }
      .running .go { background: var(--stop); }
      .hint { margin-top: 8px; font-size: 10.5px; color: var(--muted); text-align: center; }
    </style>
    <div class="card">
      <div class="head">
        <span class="logo">+</span>
        <span class="title">הזמנת כולם</span>
        <button class="x" title="הסתר">×</button>
      </div>
      <div class="stats">
        <div class="stat"><span class="num" data-selected>0</span><span class="lbl">סומנו</span></div>
        <div class="stat"><span class="num" data-left>—</span><span class="lbl">הזמנות נותרו</span></div>
      </div>
      <div class="bar"><i></i></div>
      <div class="msg"></div>
      <button class="go">סמן את כולם</button>
      <div class="hint">קיצור מקלדת: Alt+Shift+I</div>
    </div>`;

  const card = root.querySelector('.card');
  const $selected = root.querySelector('[data-selected]');
  const $left = root.querySelector('[data-left]');
  const $msg = root.querySelector('.msg');
  const $go = root.querySelector('.go');

  $go.addEventListener('click', () => (state.phase === 'running' ? stop() : run()));
  root.querySelector('.x').addEventListener('click', () => {
    dismissed = true;
    render();
  });

  const BUTTON_TEXT = { idle: 'סמן את כולם', running: 'עצור', done: 'סמן שוב', stopped: 'המשך', error: 'נסה שוב' };

  function render() {
    if (!alive) return;
    const visible = settings.showPanel && !dismissed && (state.dialogFound || state.phase === 'running');
    if (visible && !host.isConnected) document.documentElement.appendChild(host);
    if (!visible && host.isConnected) host.remove();
    if (!visible) return;
    card.className = `card ${state.phase}`;
    $selected.textContent = state.selected.toLocaleString();
    $left.textContent = state.invitesLeft === null ? '—' : state.invitesLeft.toLocaleString();
    $msg.textContent = state.message || (state.phase === 'idle' ? 'חלון ההזמנות פתוח – מוכן.' : '');
    $go.textContent = BUTTON_TEXT[state.phase];
  }

  function update(patch) {
    Object.assign(state, patch);
    render();
  }

  // ---------- Watch for the invite dialog opening / closing ----------

  let checkTimer = null;
  function scheduleCheck() {
    if (checkTimer) return;
    checkTimer = setTimeout(() => {
      checkTimer = null;
      const dialog = findInviteDialog();
      const found = !!dialog;
      if (found !== state.dialogFound) {
        state.dialogFound = found;
        if (found && state.phase !== 'running') {
          // Fresh dialog: reset the panel.
          Object.assign(state, { phase: 'idle', selected: 0, message: '', invitesLeft: getInvitesLeft(dialog) });
        }
        if (!found) dismissed = false;
        render();
      } else if (found && state.phase === 'idle') {
        const left = getInvitesLeft(dialog);
        if (left !== state.invitesLeft) update({ invitesLeft: left });
      }
    }, 400);
  }
  const observer = new MutationObserver(scheduleCheck);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleCheck();

  // ---------- Settings & messages ----------

  chrome.storage.sync.get(DEFAULTS).then((s) => {
    settings = { ...DEFAULTS, ...s };
    render();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue ?? DEFAULTS[k];
    render();
  });

  function onMessage(msg, _sender, sendResponse) {
    if (!alive) return;
    if (msg?.type === 'start') run();
    else if (msg?.type === 'stop') stop();
    else if (msg?.type === 'toggle') state.phase === 'running' ? stop() : run();
    else if (msg?.type === 'show') { dismissed = false; render(); }
    sendResponse({ ...state, dialogFound: !!findInviteDialog() });
  }
  chrome.runtime.onMessage.addListener(onMessage);

  document.addEventListener(TAKEOVER_EVENT, function teardown() {
    alive = false;
    stopRequested = true;
    observer.disconnect();
    host.remove();
    document.removeEventListener(TAKEOVER_EVENT, teardown);
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
  });
})();
