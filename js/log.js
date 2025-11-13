// js/log.js
(function () {
  "use strict";

  function getLogElement() {
    return document.getElementById("log");
  }

  function line(msg, kind = "info") {
    const logEl = getLogElement();
    if (!logEl) return;
    const span = document.createElement("span");
    span.className =
      kind === "ok"
        ? "log-line-ok"
        : kind === "error"
        ? "log-line-error"
        : kind === "muted"
        ? "log-line-muted"
        : "log-line-info";
    span.textContent = msg + "\n";
    logEl.appendChild(span);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function clear() {
    const logEl = getLogElement();
    if (logEl) logEl.textContent = "";
  }

  window.Log = { line, clear };
})();