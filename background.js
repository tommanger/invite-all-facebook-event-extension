// Keyboard shortcut (Alt+Shift+I by default) -> toggle on the active tab.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-invite') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/([a-z0-9-]+\.)*facebook\.com\//i.test(tab.url || '')) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  } catch {
    // Tab was open before the extension was installed/reloaded: inject and retry.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle' });
  }
});
