const DEFAULTS = { clickDelay: 20, loadTimeout: 6000, idleRounds: 2, maxSelect: 0, showPanel: true };
const FB_URL = /^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i;
const $ = (id) => document.getElementById(id);

let tabId = null;
let phase = 'idle';

async function send(type) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type });
  } catch {
    // The tab was open before the extension was installed/reloaded – inject now.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return await chrome.tabs.sendMessage(tabId, { type });
  }
}

const STATUS = {
  idle: (s) => (s.dialogFound ? ['ready', 'Invite dialog is open. Ready'] : ['', 'Click Invite on the event to open the invite dialog']),
  running: () => ['running', 'Selecting people…'],
  done: () => ['ready', 'Finished'],
  stopped: () => ['', 'Stopped'],
  error: () => ['', 'Error'],
};
const BUTTON = { idle: 'Select all', running: 'Stop', done: 'Select again', stopped: 'Continue', error: 'Try again' };

function render(s) {
  if (!s) return;
  phase = s.phase;
  const [cls, text] = STATUS[s.phase](s);
  $('status-line').className = `status ${cls}`;
  $('status-text').textContent = text;
  $('selected').textContent = s.selected.toLocaleString();
  $('left').textContent = s.invitesLeft == null ? '—' : s.invitesLeft.toLocaleString();
  $('msg').textContent = s.message || '';
  $('msg').className = `msg ${s.phase}`;
  const go = $('go');
  go.textContent = BUTTON[s.phase];
  go.className = `go ${s.phase === 'running' ? 'running' : ''}`;
  go.disabled = s.phase !== 'running' && !s.dialogFound;
}

async function poll() {
  try {
    render(await send('status'));
  } catch {
    $('status-text').textContent = 'Can\'t connect to the page. Refresh it and try again.';
  }
}

$('go').addEventListener('click', async () => {
  render(await send(phase === 'running' ? 'stop' : 'start'));
});

// ---------- Settings ----------
const NUM_KEYS = ['clickDelay', 'loadTimeout', 'idleRounds', 'maxSelect'];

async function loadSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  for (const k of NUM_KEYS) $(k).value = s[k];
  $('showPanel').checked = s.showPanel;
}
for (const k of NUM_KEYS) {
  $(k).addEventListener('change', () => {
    const v = Math.max(Number($(k).min) || 0, Math.round(Number($(k).value) || 0));
    $(k).value = v;
    chrome.storage.sync.set({ [k]: v });
  });
}
$('showPanel').addEventListener('change', async () => {
  await chrome.storage.sync.set({ showPanel: $('showPanel').checked });
  if ($('showPanel').checked && tabId) send('show').catch(() => {});
});
$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULTS);
  loadSettings();
});

// ---------- Init ----------
(async () => {
  loadSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !FB_URL.test(tab.url || '')) {
    $('not-fb').hidden = false;
    return;
  }
  tabId = tab.id;
  $('main').hidden = false;
  poll();
  setInterval(poll, 500);
})();
