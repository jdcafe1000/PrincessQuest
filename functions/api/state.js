/**
 * Shared chart state, stored in Cloudflare KV.
 *
 * GET  /api/state?doc=chart/state  -> {json, rev}   (json is null before the first save)
 * PUT  /api/state?doc=chart/state  <- {json}        -> {rev}
 *
 * Needs a KV namespace bound as CHART (Pages project -> Settings -> Bindings).
 */

var MAX_BYTES = 128 * 1024;
var DOC_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/;

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function keyFor(request) {
  var doc = new URL(request.url).searchParams.get("doc") || "chart/state";
  return DOC_RE.test(doc) ? "doc:" + doc : null;
}

export async function onRequestGet(context) {
  if (!context.env.CHART) return reply(503, { error: "no_kv_binding" });

  var key = keyFor(context.request);
  if (!key) return reply(400, { error: "bad_doc" });

  var stored = await context.env.CHART.get(key, { type: "json" });
  return reply(200, {
    json: stored && typeof stored.json === "string" ? stored.json : null,
    rev: stored && typeof stored.rev === "number" ? stored.rev : 0
  });
}

export async function onRequestPut(context) {
  if (!context.env.CHART) return reply(503, { error: "no_kv_binding" });

  var key = keyFor(context.request);
  if (!key) return reply(400, { error: "bad_doc" });

  var body;
  try { body = await context.request.json(); }
  catch (e) { return reply(400, { error: "bad_json" }); }

  if (!body || typeof body.json !== "string") return reply(400, { error: "expected_json_string" });
  if (body.json.length > MAX_BYTES) return reply(413, { error: "too_large" });

  // Last write wins, same as the artifact runtime does. rev only lets clients
  // notice a change cheaply; it is not a lock.
  var prev = await context.env.CHART.get(key, { type: "json" });
  var rev = (prev && typeof prev.rev === "number" ? prev.rev : 0) + 1;

  await context.env.CHART.put(key, JSON.stringify({ json: body.json, rev: rev, at: new Date().toISOString() }));
  return reply(200, { rev: rev });
}

export async function onRequest(context) {
  var m = context.request.method;
  if (m === "GET" || m === "PUT") return context.next();
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { "content-type": "application/json; charset=utf-8", allow: "GET, PUT", "cache-control": "no-store" }
  });
}
