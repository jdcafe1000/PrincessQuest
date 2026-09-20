/**
 * Princess Quest Chart.
 *
 * Static files are served straight from the assets directory; this Worker only
 * runs for paths with no matching file, which is how /api/state gets here.
 *
 * GET  /api/state?doc=chart/state  -> {json, rev}   (json is null before the first save)
 * PUT  /api/state?doc=chart/state  <- {json}        -> {rev}
 *
 * Needs a KV namespace bound as CHART. Without it the chart still works, but
 * each device saves on its own; see the binding note in wrangler.jsonc.
 */

const MAX_BYTES = 128 * 1024;
const DOC_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/;

function reply(status, body, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
  });
}

function keyFor(url) {
  const doc = url.searchParams.get("doc") || "chart/state";
  return DOC_RE.test(doc) ? "doc:" + doc : null;
}

async function handleState(request, env, url) {
  if (!env.CHART) return reply(503, { error: "no_kv_binding" });

  const key = keyFor(url);
  if (!key) return reply(400, { error: "bad_doc" });

  if (request.method === "GET") {
    const stored = await env.CHART.get(key, { type: "json" });
    return reply(200, {
      json: stored && typeof stored.json === "string" ? stored.json : null,
      rev: stored && typeof stored.rev === "number" ? stored.rev : 0
    });
  }

  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); }
    catch { return reply(400, { error: "bad_json" }); }

    if (!body || typeof body.json !== "string") return reply(400, { error: "expected_json_string" });
    if (body.json.length > MAX_BYTES) return reply(413, { error: "too_large" });

    // Last write wins, same as the artifact runtime does. rev only lets clients
    // notice a change cheaply; it is not a lock.
    const prev = await env.CHART.get(key, { type: "json" });
    const rev = (prev && typeof prev.rev === "number" ? prev.rev : 0) + 1;

    await env.CHART.put(key, JSON.stringify({ json: body.json, rev, at: new Date().toISOString() }));
    return reply(200, { rev });
  }

  return reply(405, { error: "method_not_allowed" }, { allow: "GET, PUT" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/state") return handleState(request, env, url);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  }
};
