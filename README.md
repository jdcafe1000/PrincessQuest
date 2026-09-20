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

## Layout

| Path                | What it is                                          |
| ------------------- | --------------------------------------------------- |
| `public/index.html` | The whole app: markup, styles and logic             |
| `public/sync.js`    | Cross-device sync shim (see below)                  |
| `public/_headers`   | Cache rules, so a deploy is visible straight away   |
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
available — opening the file from disk, or before the KV namespace is bound —
`use("db")` resolves `null`, and the chart quietly saves to local storage on
that device only.

KV has no push channel, so the page polls every 8 seconds while it is in the
foreground, and re-reads immediately whenever it is brought back to the front.
Writes are last-one-wins on the whole chart, which is what the artifact runtime
does too — fine for a family chart, where simultaneous edits are rare.

## Deploying

The Worker builds from this repo on every push to `main`. Build command is
empty; the deploy command is `npx wrangler deploy`, which reads
`wrangler.jsonc`.

**Turning on cross-device sync** takes one edit:

1. Dashboard → **Storage & Databases** → **KV** → *Create a namespace*, named
   `princess-quest`. Copy the namespace ID.
2. In `wrangler.jsonc`, uncomment the `kv_namespaces` block at the bottom and
   paste the ID (the file has the exact steps inline).
3. Commit and push.

Add the binding in `wrangler.jsonc`, **not** in the dashboard's *Add a binding*
dialog: `wrangler deploy` treats this file as the source of truth and drops any
binding that is not in it.

## A note on access

`/api/state` has no authentication: anyone who knows the URL can read and
overwrite the chart. That is usually fine for a family chart, but if you would
rather lock it down, put **Cloudflare Access** in front of the site (the
Worker's **Access** tab, which walks you through enabling Zero Trust first).
It is free at this scale, needs no code changes, and can be set to email-link
sign-in for just the people you list.

## Published copy

Also published as a Claude Artifact:
https://claude.ai/artifact/Jv7zXU3XKzVdnNESPJutBE — private, shareable from the
page's Share menu.
