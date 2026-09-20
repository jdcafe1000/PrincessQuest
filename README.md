# PrincessQuest

A weekly reward chart for kids, as a single self-contained HTML page.

Seven daily quests, a star for each day, a crown that walks the road to the
castle as stars are earned, and a treasure chest that totals up the week's
allowance. Quests, pictures and dollars-per-star are all editable in the page,
and "Start a new week" clears the stars for a fresh run.

Live at [princessquest.app](https://princessquest.app), deployed as a
Cloudflare Worker with static assets.

## Running it

Open `public/index.html` in any browser — no build step, no dependencies. It
saves to that browser's local storage.

On a phone or tablet, use the browser's *Add to Home Screen* to get the crown
icon and launch it like an app. The PNGs are rendered from `public/icon.svg`;
re-render them at 180, 192 and 512 if that art ever changes.

## Layout

| Path                | What it is                                          |
| ------------------- | --------------------------------------------------- |
| `public/index.html` | The whole app: markup, styles and logic             |
| `public/sync.js`    | Cross-device sync shim (see below)                  |
| `public/_headers`   | Cache rules, so a deploy is visible straight away   |
| `public/icon.svg`   | Source art for the home-screen icon                 |
| `public/manifest.json` | Name, colours and icons for an installed app     |
| `src/index.js`      | The Worker: serves `/api/state`, backed by KV       |
| `wrangler.jsonc`    | Worker name, assets directory, KV binding           |

Everything in `public/` is served directly by Cloudflare. The Worker runs only
for paths with no matching file, which is how `/api/state` reaches it.

## How syncing works

The page asks its host for a shared document store via
`window.claude.use("db")`. Two hosts answer:

- **Inside a Claude Artifact**, the runtime provides it, and `sync.js` stands
  aside completely.
- **On princessquest.app**, `sync.js` provides the same small interface backed
  by `/api/state`, which keeps the chart in a Cloudflare KV namespace.

So one copy of `index.html` works in both places, unchanged. If neither is
available — opening the file straight from disk, or if the namespace is ever
unreachable — `use("db")` resolves `null`, and the chart quietly saves to local
storage on that device only.

KV has no push channel, so the page polls every 8 seconds while it is in the
foreground, and re-reads immediately whenever it is brought back to the front.
Writes are last-one-wins on the whole chart, which is what the artifact runtime
does too — fine for a family chart, where simultaneous edits are rare.

## Deploying

The Worker builds from this repo on every push to `main`. Build command is
empty; the deploy command is `npx wrangler deploy`, which reads
`wrangler.jsonc`.

Cross-device sync is backed by the `princess-quest` KV namespace, bound as
`CHART` in `wrangler.jsonc`.

Keep that binding in `wrangler.jsonc` and **not** in the dashboard's *Add a
binding* dialog: `wrangler deploy` treats this file as the source of truth and
drops any binding that is not in it.

## Editing the quest list

**Edit quests** turns each row into a text field with a rate box, an ✕ to
remove it and an **Add a quest** button at the end, so the chart can hold as
few or as many daily tasks as suits the child.

Removing a row that already holds stars asks once before it goes, naming the
quest and what it would cost, and the prompt lapses after a few seconds. A row
with no stars goes straight away. The star count is read when the ✕ is
tapped rather than when the row was drawn, because tapping a day does not
redraw the row.

## Weeks and the archive

A week is identified by `weekKey`, the ISO date of its Monday. `weekOf` beside
it is only a label: people edit it, and `toLocaleDateString` renders it
differently per device, so it can never decide when a week ends.

On load, whenever the page returns to the front, and every ten minutes, the
chart compares `weekKey` against this Monday. When they differ it files the
finished week into `state.history` and clears the board — nothing is erased.
"Start a new week" does the same thing on demand. A week with no stars and an
empty chest is dropped rather than filed, filing the same week twice replaces
rather than duplicates it, and the archive keeps the most recent 52 weeks.

The rollover waits for the first shared state to arrive, so a device holding a
stale copy cannot file a week the other household has already moved past.

History travels inside the state document, so it syncs, works offline and works
inside the artifact with no extra endpoint. A filed week stores each quest's
icon, text, rate and a seven character day string, which keeps a year of weeks
to a few tens of kilobytes.

## Finishing a week

When the last star of the week goes up, the chart hands over to a full-screen
celebration: the princess, a spray of stars that grow in, and the week's
treasure total.

It fires only on the move into a full week, once per week per device, and a
dismissed or reloaded page does not replay it. Catching up with a week someone
else already finished is not a celebration either — the first shared state a
device receives is taken as its baseline, so opening a chart that is already
complete stays quiet. Starting a new week re-arms it.

## Sign-in

The site sits behind **Cloudflare Access** with a one-time PIN policy: visitors
enter an email from the allowed list and get a code. Access guards the whole
hostname, so `/api/state` is covered along with the page — it has no
authentication of its own and must not be exposed directly. Keep the
`workers.dev` routes disabled for that reason.

To change who may sign in: **Zero Trust → Access → Applications →
princessquest → Policies**. Each person signs in as themselves and they all
share one chart, which is what makes it work across two households.

When an Access session expires, a `fetch` for `/api/state` is answered with a
redirect to the sign-in page rather than JSON. `sync.js` notices and reloads
once so Access can take over the page; if that does not clear it, the chart
keeps working and saves locally rather than reloading in a loop.

## Published copy

Also published as a Claude Artifact:
https://claude.ai/artifact/Jv7zXU3XKzVdnNESPJutBE — private, shareable from the
page's Share menu.
