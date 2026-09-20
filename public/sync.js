/**
 * Cross-device sync for the chart when it is served from our own domain.
 *
 * The page asks for window.claude.use("db") and drives it with doc().set()
 * and doc().onSnapshot(). Inside a Claude Artifact the real runtime provides
 * that, and this file stands aside. Anywhere else, this provides the same
 * small surface backed by /api/state, so index.html needs no changes.
 *
 * KV has no push channel, so snapshots arrive by polling while the page is
 * visible, plus an immediate read whenever it is brought back to the front.
 */
(function () {
  "use strict";

  if (window.claude && window.claude.use) return;

  var ENDPOINT = "/api/state";
  var POLL_MS = 8000;
  var docs = {};

  var RELOAD_KEY = "princess-quest-reauth";
  var reloading = false;

  // Behind Cloudflare Access an expired session answers a fetch with a redirect
  // to the sign-in page instead of our JSON, which would make every save fail
  // quietly. Reload so Access can take over the whole page and ask for the
  // email code. Reload at most once per page and not twice in quick
  // succession, so a redirect we cannot clear degrades to local saving rather
  // than a reload loop.
  function signInExpired() {
    if (reloading) return;
    reloading = true;
    try {
      var last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last < 30000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch (e) {}
    location.reload();
  }

  function request(url, opts) {
    return fetch(url, opts).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (res.redirected || type.indexOf("json") === -1) {
        signInExpired();
        throw new Error("sign-in required");
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  function makeDoc(path) {
    var url = ENDPOINT + "?doc=" + encodeURIComponent(path);
    var listeners = [];
    var lastJson = null;   // newest text we have sent or received
    var inflight = 0;      // our own writes still in the air
    var timer = null;

    function emit(json) {
      var snap = {
        exists: true,
        metadata: { hasPendingWrites: inflight > 0 },
        data: function () { return { json: json }; }
      };
      listeners.forEach(function (l) {
        try { l.next(snap); } catch (e) {}
      });
    }

    function fail(err) {
      listeners.forEach(function (l) {
        if (l.error) { try { l.error(err); } catch (e) {} }
      });
    }

    function pull() {
      // Skip while one of our own writes is settling: it would echo back stale text.
      if (inflight > 0 || document.hidden) return Promise.resolve();
      return request(url, { headers: { accept: "application/json" }, cache: "no-store" })
        .then(function (d) {
          if (!d || typeof d.json !== "string" || d.json === lastJson) return;
          lastJson = d.json;
          emit(d.json);
        })
        .catch(fail);
    }

    function set(value) {
      var json = value && value.json;
      if (typeof json !== "string") return Promise.reject(new TypeError('set() expects {json: string}'));
      lastJson = json;
      inflight++;
      return request(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: json })
      }).then(
        function (d) { inflight--; return d; },
        function (err) { inflight--; throw err; }
      );
    }

    function listen() {
      if (timer) return;
      timer = setInterval(pull, POLL_MS);
      document.addEventListener("visibilitychange", function () { if (!document.hidden) pull(); });
      window.addEventListener("focus", pull);
      window.addEventListener("online", pull);
    }

    function onSnapshot(next, error) {
      var entry = { next: next, error: error };
      listeners.push(entry);
      listen();
      pull();
      return function unsubscribe() {
        var i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
        if (!listeners.length && timer) { clearInterval(timer); timer = null; }
      };
    }

    return { set: set, onSnapshot: onSnapshot };
  }

  var db = {
    doc: function (path) {
      if (!docs[path]) docs[path] = makeDoc(path);
      return docs[path];
    }
  };

  // Resolve null rather than a store that cannot work, so the page falls back
  // to local storage quietly instead of reporting saves as failing. This is
  // the state before a KV namespace is bound, and offline.
  var reachable = null;
  function isReachable() {
    if (!reachable) {
      reachable = request(ENDPOINT, { headers: { accept: "application/json" }, cache: "no-store" })
        .then(function () { return true; })
        .catch(function () { return false; });
    }
    return reachable;
  }

  window.claude = {
    use: function (name) {
      if (name !== "db") return Promise.resolve(null);
      return isReachable().then(function (ok) { return ok ? db : null; });
    }
  };
})();
