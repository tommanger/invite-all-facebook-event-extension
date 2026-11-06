# Invite All – Facebook Event Inviter

A Chrome extension that selects every follower in a Facebook event's invite dialog with one click. It scrolls to load more people on its own and stops when the list ends, when you run out of invites (INVITES LEFT = 0), or when you press Stop.

It only selects people. You still click **Send invites** yourself.

## Install (once)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this folder
4. Optional: click the puzzle icon in the toolbar and pin Invite All

## Usage

1. Open your event and click **Invite**
2. A panel appears in the bottom-left corner. Click **Select all**
   (or use the toolbar icon, or the keyboard shortcut **Alt+Shift+I**)
3. When it finishes, click **Send invites** on Facebook

The toolbar popup has settings for click speed, how long to wait for more people to load, a maximum number to select, and whether to show the floating panel.

## Keeping it installed

A Chrome update doesn't remove an extension loaded with **Load unpacked**. It usually disappears for one of these reasons:

| Cause | What to do |
|---|---|
| The folder was moved or deleted (for example in Downloads or a temp folder) | Keep this folder in a permanent location and don't move it |
| It was installed from a `.crx` file outside the Chrome Web Store (Chrome disables these) | Use Load unpacked only |
| It was loaded with the `--load-extension` flag (Chrome no longer supports it) | Same as above |
| The code itself was lost | The code is on GitHub. If the folder is gone, `git clone` it and load it again |

After changing the code, click ⟳ (Reload) next to the extension in `chrome://extensions`. You don't need to refresh the Facebook page.

## If Facebook changes something

All the page logic is in [content.js](content.js):
- `findInviteDialog`: finds a `[role="dialog"]` that has checkboxes and a word like "invite" (English or Hebrew)
- `LEFT_PATTERNS`: reads the "INVITES LEFT" counter (English and Hebrew)
- `getScrollContainer`: the element that gets scrolled to load more people
- `loadMore`: scrolls down and waits until new people appear, or until Facebook's `Loading...` indicator is gone

## Files

- `manifest.json`: extension config (Manifest V3)
- `content.js`: runs on Facebook, selects people and shows the floating panel
- `popup.html/.css/.js`: toolbar popup and settings
- `background.js`: keyboard shortcut
- `scripts/make_icons.py`: regenerates the icons (`python3 scripts/make_icons.py`)
