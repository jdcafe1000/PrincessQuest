# PrincessQuest

A weekly reward chart for kids, as a single self-contained HTML page.

Seven daily quests, a star for each day, a crown that walks the road to the
castle as stars are earned, and a treasure chest that totals up the week's
allowance. Quests, pictures and dollars-per-star are all editable in the page,
and "Start a new week" clears the stars for a fresh run.

## Running it

Open `index.html` in any browser — no build step, no dependencies.

## Files

| Path                     | What it is                                             |
| ------------------------ | ------------------------------------------------------ |
| `index.html`             | The whole app: markup, styles and logic                |
| `sync.js`                | Cross-device sync shim (see below)                     |
| `functions/api/state.js` | Cloudflare Pages Function storing the chart in KV      |
| `_headers`               | Cache rules, so a deploy is visible straight away      |

## How syncing works

The page asks the host for a shared document store via
`window.claude.use("db")`. Two hosts answer:

- **Inside a Claude Artifact**, the runtime provides it, and `sync.js` stands
  aside completely.
- **Anywhere else**, `sync.js` provides the same small interface backed by
  `/api/state`, which keeps the chart in a Cloudflare KV namespace.

So one copy of `index.html` works in both places, unchanged. With neither host
available (opening the file straight from disk), the chart still works and
saves to that browser's local storage only.

KV has no push channel, so the page polls every 8 seconds while it is in the
foreground, and re-reads immediately whenever it is brought back to the front.
Writes are last-one-wins on the whole chart, which is what the artifact runtime
does too — fine for a family chart, where simultaneous edits are rare.

## Deploying to Cloudflare Pages

1. **Create the KV namespace.** Cloudflare dashboard → **Storage & Databases**
   → **KV** → *Create a namespace*, name it `princess-quest`.
2. **Create the Pages project.** **Workers & Pages** → *Create* → **Pages** →
   *Connect to Git*, and pick this repository.
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: `/`
3. **Bind the namespace.** Once the first deploy finishes, open the project's
   **Settings → Bindings** → *Add* → **KV namespace**:
   - Variable name: `CHART`  ← must be exactly this
   - KV namespace: `princess-quest`

   Then redeploy (**Deployments** → *Retry deployment*) so the binding is
   picked up.
4. **Attach the domain.** **Custom domains** → *Set up a custom domain*.

Every push to the connected branch redeploys automatically. Until step 3 is
done the chart still works, but saves locally on each device only.

## A note on access

`/api/state` has no authentication: anyone who knows the URL can read and
overwrite the chart. That is usually fine for a family chart on an
unadvertised domain, but if you would rather lock it down, put
**Cloudflare Access** (Zero Trust → Access → Applications) in front of the
site. It is free for small teams, takes no code changes, and can be set to
email-link sign-in for just the people you list.

## Published copy

Also published as a Claude Artifact:
https://claude.ai/artifact/Jv7zXU3XKzVdnNESPJutBE — private, shareable from the
page's Share menu.
