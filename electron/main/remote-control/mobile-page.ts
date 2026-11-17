/**
 * The page a paired phone opens. Served by the remote-control listener only,
 * as three static files plus a copy file, under a CSP that allows nothing but
 * same-origin script, style and fetch: no inline script or style, no eval, no
 * external request. All text is written with `textContent`, never as HTML.
 *
 * The device token is kept in `sessionStorage`: it survives a reload of the
 * tab but not closing it, so a lost or shared phone does not stay paired in a
 * forgotten tab. Re-pairing needs a fresh code from the desktop.
 */

/** Keys under `desktop:remoteControlMobile`, sent to the page in the app's language. */
export const REMOTE_MOBILE_COPY_KEYS = [
  "title",
  "risk",
  "pairTitle",
  "pairHint",
  "codeLabel",
  "nameLabel",
  "nameDefault",
  "pairButton",
  "pairFailed",
  "pairLocked",
  "deviceLimit",
  "refresh",
  "forget",
  "lastUpdated",
  "requestsTitle",
  "requestsEmpty",
  "tasksTitle",
  "tasksEmpty",
  "approvalLabel",
  "questionLabel",
  "approve",
  "deny",
  "send",
  "answerPlaceholder",
  "requiredMissing",
  "resultApplied",
  "resultExpired",
  "resultInvalid",
  "resultUnavailable",
  "desktopUnavailable",
  "rateLimited",
  "signedOut",
  "connectionFailed",
  "running",
  "waiting",
] as const;

export type RemoteMobileCopyKey = (typeof REMOTE_MOBILE_COPY_KEYS)[number];

export const REMOTE_MOBILE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<meta name="referrer" content="no-referrer">
<title>Stave</title>
<link rel="stylesheet" href="/assets/remote.css">
<script src="/assets/remote.js" defer></script>
</head>
<body>
<main class="page">
  <header class="top">
    <h1 data-copy="title"></h1>
    <p class="risk" data-copy="risk"></p>
  </header>
  <p class="notice" id="notice" role="status" aria-live="polite" hidden></p>
  <section id="pair" class="panel" hidden>
    <h2 data-copy="pairTitle"></h2>
    <p class="hint" data-copy="pairHint"></p>
    <form id="pair-form" novalidate>
      <label for="pair-code" data-copy="codeLabel"></label>
      <input id="pair-code" name="code" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" inputmode="text" maxlength="32" required>
      <label for="pair-name" data-copy="nameLabel"></label>
      <input id="pair-name" name="name" autocomplete="off" maxlength="80" required>
      <button type="submit" class="primary" data-copy="pairButton"></button>
    </form>
  </section>
  <section id="work" hidden>
    <div class="toolbar">
      <span class="hint" id="updated"></span>
      <button type="button" id="refresh" data-copy="refresh"></button>
    </div>
    <section class="group" aria-labelledby="requests-title">
      <h2 id="requests-title" data-copy="requestsTitle"></h2>
      <ul id="requests" class="list"></ul>
      <p id="requests-empty" class="hint" data-copy="requestsEmpty" hidden></p>
    </section>
    <section class="group" aria-labelledby="tasks-title">
      <h2 id="tasks-title" data-copy="tasksTitle"></h2>
      <ul id="tasks" class="list"></ul>
      <p id="tasks-empty" class="hint" data-copy="tasksEmpty" hidden></p>
    </section>
    <button type="button" id="forget" class="quiet" data-copy="forget"></button>
  </section>
</main>
</body>
</html>
`;

export const REMOTE_MOBILE_CSS = String.raw`:root {
  color-scheme: light dark;
  --bg: #f7f7f8;
  --surface: #ffffff;
  --text: #18181b;
  --muted: #52525b;
  --line: #e4e4e7;
  --primary: #2563eb;
  --primary-text: #ffffff;
  --danger: #b91c1c;
  --warning-bg: #fef3c7;
  --warning-text: #78350f;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111113;
    --surface: #1c1c1f;
    --text: #f4f4f5;
    --muted: #a1a1aa;
    --line: #2e2e33;
    --primary: #3b82f6;
    --primary-text: #ffffff;
    --danger: #f87171;
    --warning-bg: #3a2a0a;
    --warning-text: #fde68a;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  -webkit-tap-highlight-color: transparent;
}
.page {
  max-width: 640px;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
h1 { font-size: 20px; margin: 0 0 8px; }
h2 { font-size: 17px; margin: 0 0 8px; }
h3 { font-size: 15px; margin: 0; overflow-wrap: anywhere; }
p { margin: 0; }
.top { margin-bottom: 16px; }
.risk { font-size: 14px; padding: 8px 12px; border-radius: 8px; background: var(--warning-bg); color: var(--warning-text); }
.hint { color: var(--muted); font-size: 14px; }
.notice { margin: 0 0 16px; padding: 12px; border-radius: 8px; background: var(--surface); }
.notice.error { color: var(--danger); }
.panel, .item { background: var(--surface); border-radius: 12px; padding: 16px; }
form { display: grid; gap: 8px; margin-top: 12px; }
label { font-size: 14px; font-weight: 600; }
input[type="text"], input:not([type]), textarea {
  width: 100%;
  font: inherit;
  font-size: 16px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
}
button {
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--text);
  touch-action: manipulation;
}
button:disabled { opacity: 0.55; }
button.primary { background: var(--primary); border-color: var(--primary); color: var(--primary-text); }
button.quiet { border: 0; background: transparent; color: var(--muted); margin-top: 24px; padding: 0; }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.group { margin-bottom: 24px; }
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.item { display: grid; gap: 8px; }
.meta { color: var(--muted); font-size: 13px; overflow-wrap: anywhere; }
.summary { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; max-height: 240px; overflow: auto; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions button { flex: 1 1 140px; }
fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 6px; }
legend { font-size: 14px; font-weight: 600; padding: 0; margin-bottom: 4px; overflow-wrap: anywhere; }
.choice { display: flex; align-items: flex-start; gap: 8px; font-weight: 400; min-height: 32px; }
.choice input { margin-top: 4px; width: 18px; height: 18px; flex: none; }
.result { font-size: 14px; }
.result.error { color: var(--danger); }
.task-state { font-size: 13px; color: var(--muted); }
`;

export const REMOTE_MOBILE_JS = String.raw`(function () {
  "use strict";
  var TOKEN_KEY = "stave-remote-token";
  var POLL_MS = 5000;
  var copy = {};
  var timer = null;
  var busy = false;
  var backoffUntil = 0;

  function $(id) { return document.getElementById(id); }
  function t(key) { return Object.prototype.hasOwnProperty.call(copy, key) ? copy[key] : key; }
  function token() { try { return sessionStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setToken(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* storage unavailable: stay signed out */ }
  }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function notice(message, isError) {
    var node = $("notice");
    if (!message) { node.hidden = true; node.textContent = ""; return; }
    node.textContent = message;
    node.className = isError ? "notice error" : "notice";
    node.hidden = false;
  }
  function applyCopy() {
    var nodes = document.querySelectorAll("[data-copy]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute("data-copy"));
    document.title = t("title");
  }
  function api(path, options) {
    var headers = {};
    var auth = token();
    if (auth) headers.Authorization = "Bearer " + auth;
    var init = { method: "GET", headers: headers, cache: "no-store", credentials: "omit", redirect: "error" };
    if (options && options.body !== undefined) {
      init.method = "POST";
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(path, init);
  }

  function showPair() {
    stopPolling();
    $("work").hidden = true;
    $("pair").hidden = false;
    var code = $("pair-code");
    var match = /^#([a-f0-9]{32})$/.exec(location.hash || "");
    if (match && !code.value) code.value = match[1];
    if (!$("pair-name").value) $("pair-name").value = t("nameDefault");
  }
  function showWork() {
    $("pair").hidden = true;
    $("work").hidden = false;
    refresh();
    startPolling();
  }
  function signedOut() {
    setToken(null);
    notice(t("signedOut"), true);
    showPair();
  }

  function pair(event) {
    event.preventDefault();
    var code = $("pair-code").value.trim().toLowerCase();
    var name = $("pair-name").value.trim() || t("nameDefault");
    var button = event.target.querySelector("button");
    button.disabled = true;
    api("/api/pair", { body: { code: code, name: name } }).then(function (response) {
      if (response.status === 200) {
        return response.json().then(function (data) {
          setToken(data.token);
          $("pair-code").value = "";
          if (history.replaceState) history.replaceState(null, "", "/");
          notice("");
          showWork();
        });
      }
      if (response.status === 429) notice(t("pairLocked"), true);
      else if (response.status === 409) notice(t("deviceLimit"), true);
      else notice(t("pairFailed"), true);
    }).catch(function () {
      notice(t("connectionFailed"), true);
    }).then(function () { button.disabled = false; });
  }

  function taskTitle(snapshot, request) {
    for (var i = 0; i < snapshot.tasks.length; i++) {
      var task = snapshot.tasks[i];
      if (task.workspaceId === request.workspaceId && task.taskId === request.taskId) return task;
    }
    return null;
  }

  function resultMessage(result) {
    if (result.reason === "applied") return t("resultApplied");
    if (result.reason === "expired") return t("resultExpired");
    if (result.reason === "invalid") return t("resultInvalid");
    return t("resultUnavailable");
  }

  function send(item, action, status) {
    var buttons = item.querySelectorAll("button, input");
    for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
    status.className = "result";
    status.textContent = "";
    api("/api/action", { body: action }).then(function (response) {
      if (response.status === 401) { signedOut(); return null; }
      if (response.status === 429) return { ok: false, reason: "rate" };
      if (response.status !== 200) return { ok: false, reason: "unavailable" };
      return response.json();
    }).catch(function () {
      return { ok: false, reason: "network" };
    }).then(function (result) {
      if (!result) return;
      var message = result.reason === "rate" ? t("rateLimited") : result.reason === "network" ? t("connectionFailed") : resultMessage(result);
      status.className = result.ok ? "result" : "result error";
      status.textContent = message;
      if (result.ok || result.reason === "expired" || result.reason === "invalid") {
        setTimeout(refresh, 800);
      } else {
        for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
      }
    });
  }

  function target(request) {
    return { workspaceId: request.workspaceId, taskId: request.taskId, turnId: request.turnId, requestId: request.requestId, messageId: request.messageId };
  }

  function renderQuestion(item, request, status) {
    var form = el("form");
    form.noValidate = true;
    var fields = [];
    request.questions.forEach(function (question, index) {
      var set = el("fieldset");
      set.appendChild(el("legend", null, question.question));
      var name = "q" + index;
      var choices = [];
      question.options.forEach(function (option, optionIndex) {
        var label = el("label", "choice");
        var input = document.createElement("input");
        input.type = question.multiSelect ? "checkbox" : "radio";
        input.name = name;
        input.value = option.value;
        input.id = name + "-" + optionIndex;
        label.appendChild(input);
        label.appendChild(el("span", null, option.label));
        set.appendChild(label);
        choices.push(input);
      });
      var custom = null;
      if (question.options.length === 0) {
        custom = document.createElement("input");
        custom.type = "text";
        custom.maxLength = 4000;
        custom.placeholder = t("answerPlaceholder");
        custom.setAttribute("aria-label", question.question);
        set.appendChild(custom);
      }
      fields.push({ question: question, choices: choices, custom: custom });
      form.appendChild(set);
    });
    var actions = el("div", "actions");
    var submit = el("button", "primary", t("send"));
    submit.type = "submit";
    actions.appendChild(submit);
    form.appendChild(actions);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var answers = {};
      var missing = false;
      fields.forEach(function (field) {
        var picked = [];
        field.choices.forEach(function (input) { if (input.checked) picked.push(input.value); });
        var text = field.custom ? field.custom.value.trim() : "";
        if (text) picked = [text];
        var value = picked.join(", ");
        if (value) answers[field.question.key] = value;
        else if (field.question.required) missing = true;
      });
      if (missing) {
        status.className = "result error";
        status.textContent = t("requiredMissing");
        return;
      }
      var action = target(request);
      action.kind = "question";
      action.answers = answers;
      send(item, action, status);
    });
    item.appendChild(form);
  }

  function renderRequests(snapshot) {
    var list = $("requests");
    list.textContent = "";
    $("requests-empty").hidden = snapshot.requests.length > 0;
    snapshot.requests.forEach(function (request) {
      var item = el("li", "item");
      var task = taskTitle(snapshot, request);
      item.appendChild(el("p", "meta", (request.kind === "approval" ? t("approvalLabel") : t("questionLabel")) + (task ? " · " + task.workspaceName : "")));
      item.appendChild(el("h3", null, task ? task.title : request.taskId));
      if (request.tool) item.appendChild(el("p", "meta", request.tool));
      if (request.summary) item.appendChild(el("p", "summary", request.summary));
      var status = el("p", "result");
      status.setAttribute("role", "status");
      if (request.kind === "approval") {
        var actions = el("div", "actions");
        var approve = el("button", "primary", t("approve"));
        var deny = el("button", null, t("deny"));
        approve.type = "button";
        deny.type = "button";
        approve.addEventListener("click", function () {
          var action = target(request); action.kind = "approval"; action.approved = true; send(item, action, status);
        });
        deny.addEventListener("click", function () {
          var action = target(request); action.kind = "approval"; action.approved = false; send(item, action, status);
        });
        actions.appendChild(approve);
        actions.appendChild(deny);
        item.appendChild(actions);
      } else {
        renderQuestion(item, request, status);
      }
      item.appendChild(status);
      list.appendChild(item);
    });
  }

  function renderTasks(snapshot) {
    var list = $("tasks");
    list.textContent = "";
    var running = snapshot.tasks.filter(function (task) { return task.running; });
    $("tasks-empty").hidden = running.length > 0;
    running.forEach(function (task) {
      var item = el("li", "item");
      item.appendChild(el("p", "meta", task.workspaceName));
      item.appendChild(el("h3", null, task.title));
      var waiting = snapshot.requests.some(function (request) { return request.taskId === task.taskId && request.workspaceId === task.workspaceId; });
      item.appendChild(el("p", "task-state", waiting ? t("waiting") : t("running")));
      list.appendChild(item);
    });
  }

  function interacting() {
    var active = document.activeElement;
    return Boolean(active && active.closest && active.closest("#requests") && (active.tagName === "INPUT" || active.tagName === "TEXTAREA"));
  }

  function refresh(manual) {
    if (busy || !token() || Date.now() < backoffUntil) return;
    if (!manual && interacting()) return;
    busy = true;
    api("/api/state").then(function (response) {
      if (response.status === 401) { signedOut(); return; }
      if (response.status === 429) { backoffUntil = Date.now() + 30000; notice(t("rateLimited"), true); return; }
      if (response.status === 503) { notice(t("desktopUnavailable"), true); return; }
      if (response.status !== 200) { notice(t("connectionFailed"), true); return; }
      return response.json().then(function (snapshot) {
        notice("");
        renderRequests(snapshot);
        renderTasks(snapshot);
        $("updated").textContent = t("lastUpdated") + " " + new Date().toLocaleTimeString();
      });
    }).catch(function () {
      notice(t("connectionFailed"), true);
    }).then(function () { busy = false; });
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(function () { if (document.visibilityState === "visible") refresh(false); }, POLL_MS);
  }
  function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }

  function start() {
    $("pair-form").addEventListener("submit", pair);
    $("refresh").addEventListener("click", function () { refresh(true); });
    $("forget").addEventListener("click", function () { setToken(null); notice(""); showPair(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && token()) refresh(false); });
    if (token()) showWork(); else showPair();
  }

  fetch("/assets/remote-copy.json", { cache: "no-store", credentials: "omit" }).then(function (response) {
    return response.ok ? response.json() : {};
  }).catch(function () { return {}; }).then(function (data) {
    copy = data && data.copy ? data.copy : {};
    if (data && typeof data.locale === "string") document.documentElement.lang = data.locale;
    applyCopy();
    start();
  });
})();
`;

export interface RemoteMobileCopy {
  locale: string;
  copy: Record<RemoteMobileCopyKey, string>;
}

const encoder = new TextEncoder();

/** The asset port for the listener: the four files above, nothing else. */
export function createRemoteMobileAssets(readCopy: () => RemoteMobileCopy) {
  return async (path: string): Promise<{ body: Uint8Array; type: string } | null> => {
    switch (path) {
      case "remote.html":
        return { body: encoder.encode(REMOTE_MOBILE_HTML), type: "text/html; charset=utf-8" };
      case "assets/remote.css":
        return { body: encoder.encode(REMOTE_MOBILE_CSS), type: "text/css; charset=utf-8" };
      case "assets/remote.js":
        return { body: encoder.encode(REMOTE_MOBILE_JS), type: "text/javascript; charset=utf-8" };
      case "assets/remote-copy.json":
        return { body: encoder.encode(JSON.stringify(readCopy())), type: "application/json; charset=utf-8" };
      default:
        return null;
    }
  };
}
