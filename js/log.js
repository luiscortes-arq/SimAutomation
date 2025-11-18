// js/log.js
// UI de LOG con tabs (Sort & Purge / Replace & Merge) y columnas side-by-side
(function () {
  "use strict";

  let shellBuilt = false;
  let sortView = null;
  let mergeView = null;
  let tabSort = null;
  let tabMerge = null;
  let currentType = "sort"; // "sort" o "merge"

  function getRoot() {
    return document.getElementById("log");
  }

  function buildShellIfNeeded() {
    if (shellBuilt) return;
    const root = getRoot();
    if (!root) return;

    root.classList.add("log-container");
    root.innerHTML = "";

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "log-tabs";

    tabSort = document.createElement("button");
    tabSort.type = "button";
    tabSort.className = "log-tab log-tab-active";
    tabSort.textContent = "SORT & PURGE";
    tabSort.dataset.type = "sort";

    tabMerge = document.createElement("button");
    tabMerge.type = "button";
    tabMerge.className = "log-tab";
    tabMerge.textContent = "REPLACE & MERGE";
    tabMerge.dataset.type = "merge";

    tabs.appendChild(tabSort);
    tabs.appendChild(tabMerge);

    // Vistas
    const views = document.createElement("div");
    views.className = "log-views";

    sortView = document.createElement("div");
    sortView.id = "log-sort-view";
    sortView.className = "log-view log-view-active";

    mergeView = document.createElement("div");
    mergeView.id = "log-merge-view";
    mergeView.className = "log-view";

    views.appendChild(sortView);
    views.appendChild(mergeView);

    root.appendChild(tabs);
    root.appendChild(views);

    // Eventos tabs
    tabSort.addEventListener("click", () => switchType("sort"));
    tabMerge.addEventListener("click", () => switchType("merge"));

    shellBuilt = true;
  }

  function switchType(type) {
    if (!shellBuilt) return;
    currentType = type;

    if (type === "sort") {
      tabSort.classList.add("log-tab-active");
      tabMerge.classList.remove("log-tab-active");
      sortView.classList.add("log-view-active");
      mergeView.classList.remove("log-view-active");
    } else {
      tabMerge.classList.add("log-tab-active");
      tabSort.classList.remove("log-tab-active");
      mergeView.classList.add("log-view-active");
      sortView.classList.remove("log-view-active");
    }
  }

  // Limpia todas las entradas (ambos tipos) pero mantiene la estructura y tabs
  function clear() {
    buildShellIfNeeded();
    if (sortView) sortView.innerHTML = "";
    if (mergeView) mergeView.innerHTML = "";
  }

  // Mensajes simples de texto al final del root (para info o errores)
  function line(msg, kind = "info") {
    buildShellIfNeeded();
    const root = getRoot();
    if (!root) return;
    const div = document.createElement("div");
    div.className =
      kind === "ok"
        ? "log-line-ok"
        : kind === "error"
        ? "log-line-error"
        : kind === "muted"
        ? "log-line-muted"
        : "log-line-info";
    div.textContent = msg;
    root.appendChild(div);
    root.scrollTop = root.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // -------- DIFF CON CONTEXTO --------

  // LCS para alinear contexto (líneas comunes) sin marcar todo como cambiado
  function diffLinesWithLCS(oldLines, newLines) {
    const n = oldLines.length;
    const m = newLines.length;

    const maxCells = 5000000; // límite de seguridad
    const totalCells = n * m;

    // Fallback simple si el archivo es gigantesco: línea por índice
    if (totalCells > maxCells) {
      const ops = [];
      const maxLen = Math.max(n, m);
      for (let k = 0; k < maxLen; k++) {
        const o = k < n ? oldLines[k] : null;
        const nn = k < m ? newLines[k] : null;

        if (o !== null && nn !== null) {
          if (o === nn) {
            ops.push({ type: "common", old: o, new: nn });
          } else {
            // se considera modificado (del + add)
            ops.push({ type: "del", old: o, new: "" });
            ops.push({ type: "add", old: "", new: nn });
          }
        } else if (o !== null) {
          ops.push({ type: "del", old: o, new: "" });
        } else if (nn !== null) {
          ops.push({ type: "add", old: "", new: nn });
        }
      }
      return ops;
    }

    // DP LCS
    const dp = Array(n + 1);
    for (let i = 0; i <= n; i++) {
      dp[i] = new Array(m + 1).fill(0);
    }

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (oldLines[i] === newLines[j]) {
          dp[i][j] = dp[i + 1][j + 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    const ops = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
      if (oldLines[i] === newLines[j]) {
        ops.push({ type: "common", old: oldLines[i], new: newLines[j] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: "del", old: oldLines[i], new: "" });
        i++;
      } else {
        ops.push({ type: "add", old: "", new: newLines[j] });
        j++;
      }
    }

    while (i < n) {
      ops.push({ type: "del", old: oldLines[i], new: "" });
      i++;
    }

    while (j < m) {
      ops.push({ type: "add", old: "", new: newLines[j] });
      j++;
    }

    return ops;
  }

  // Construye HTML side-by-side usando las operaciones del diff
  function buildSideBySideHtml(originalText, processedText) {
    const oldLines = String(originalText).split(/\r?\n/);
    const newLines = String(processedText).split(/\r?\n/);

    const ops = diffLinesWithLCS(oldLines, newLines);

    const origRendered = [];
    const procRendered = [];

    for (const op of ops) {
      if (op.type === "common") {
        const oSafe = escapeHtml(op.old);
        const nSafe = escapeHtml(op.new);
        origRendered.push(oSafe);
        procRendered.push(nSafe);
      } else if (op.type === "del") {
        const oSafe = escapeHtml(op.old === "" ? " " : op.old);
        origRendered.push("<s>" + oSafe + "</s>");
        procRendered.push("");
      } else if (op.type === "add") {
        const nSafe = escapeHtml(op.new === "" ? " " : op.new);
        origRendered.push("");
        procRendered.push("<mark>" + nSafe + "</mark>");
      }
    }

    return {
      originalHtml: origRendered.join("\n"),
      processedHtml: procRendered.join("\n"),
    };
  }

  // -------- RENDER DE ENTRADAS --------

  // Sort & Purge
  function showSortDiff(fileName, originalText, processedText) {
    buildShellIfNeeded();
    if (!sortView) return;

    switchType("sort");

    const entry = document.createElement("div");
    entry.className = "log-entry";

    const header = document.createElement("div");
    header.className = "log-entry-header";
    header.textContent = fileName || "Archivo sin nombre";
    entry.appendChild(header);

    const columns = document.createElement("div");
    columns.className = "log-entry-columns";

    const colOrig = document.createElement("div");
    colOrig.className = "log-column";
    const colOrigHeader = document.createElement("div");
    colOrigHeader.className = "log-column-header";
    colOrigHeader.textContent = "CÓDIGO ORIGINAL";
    const preOrig = document.createElement("pre");
    preOrig.className = "log-code-block";

    const colProc = document.createElement("div");
    colProc.className = "log-column";
    const colProcHeader = document.createElement("div");
    colProcHeader.className = "log-column-header";
    colProcHeader.textContent = "CÓDIGO PROCESADO";
    const preProc = document.createElement("pre");
    preProc.className = "log-code-block";

    const diff = buildSideBySideHtml(originalText, processedText);
    preOrig.innerHTML = diff.originalHtml;
    preProc.innerHTML = diff.processedHtml;

    colOrig.appendChild(colOrigHeader);
    colOrig.appendChild(preOrig);

    colProc.appendChild(colProcHeader);
    colProc.appendChild(preProc);

    columns.appendChild(colOrig);
    columns.appendChild(colProc);

    entry.appendChild(columns);
    sortView.appendChild(entry);
  }

  // Replace & Merge
  function showMergeDiff(
    jobLabel,
    fileOrigName,
    fileNewName,
    newXmlOriginal,
    mergedXml
  ) {
    buildShellIfNeeded();
    if (!mergeView) return;

    switchType("merge");

    const entry = document.createElement("div");
    entry.className = "log-entry";

    const header = document.createElement("div");
    header.className = "log-entry-header";

    const parts = [];
    if (jobLabel) parts.push(jobLabel);
    if (fileOrigName) parts.push("ORIGINAL: " + fileOrigName);
    if (fileNewName) parts.push("NUEVO: " + fileNewName);
    header.textContent = parts.join(" · ") || "Par";

    entry.appendChild(header);

    const columns = document.createElement("div");
    columns.className = "log-entry-columns";

    const colOrig = document.createElement("div");
    colOrig.className = "log-column";
    const colOrigHeader = document.createElement("div");
    colOrigHeader.className = "log-column-header";
    colOrigHeader.textContent = "CÓDIGO ORIGINAL (NUEVO)";
    const preOrig = document.createElement("pre");
    preOrig.className = "log-code-block";

    const colProc = document.createElement("div");
    colProc.className = "log-column";
    const colProcHeader = document.createElement("div");
    colProcHeader.className = "log-column-header";
    colProcHeader.textContent = "CÓDIGO PROCESADO (MERGED)";
    const preProc = document.createElement("pre");
    preProc.className = "log-code-block";

    const diff = buildSideBySideHtml(newXmlOriginal, mergedXml);
    preOrig.innerHTML = diff.originalHtml;
    preProc.innerHTML = diff.processedHtml;

    colOrig.appendChild(colOrigHeader);
    colOrig.appendChild(preOrig);

    colProc.appendChild(colProcHeader);
    colProc.appendChild(preProc);

    columns.appendChild(colOrig);
    columns.appendChild(colProc);

    entry.appendChild(columns);
    mergeView.appendChild(entry);
  }

  // Exponer API esperada por app.js
  window.Log = {
    line,
    clear,
    showSortDiff,
    showMergeDiff,
  };
})();
