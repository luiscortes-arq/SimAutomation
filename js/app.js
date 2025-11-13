// js/app.js
// UI + integración Sort & Purge + Pipeline (vertical simple, sin Paso 02 independiente)
(function () {
  "use strict";

  const { AppConfig, loadAppConfig } = window;
  const { line: logLine, clear: clearLog } = window.Log;
  const { sortAndPurgeUdatasmith } = window.DatasmithSort;
  const { runMerge } = window.DatasmithMerge;

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No se seleccionó archivo."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Error al leer archivo."));
      reader.readAsText(file, "utf-8");
    });
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "application/xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "output.udatasmith";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function sanitizeBaseName(name) {
    if (!name) return "";
    let s = name.trim();
    s = s.replace(/\.udatasmith$/i, "");
    s = s.replace(/[\\/:"*?<>|]/g, "");
    return s || "";
  }

  function buildOutputFilename(baseId, defaultBaseKey) {
    const baseInput = document.getElementById(baseId);
    const rawBase = baseInput ? baseInput.value : "";
    const base =
      sanitizeBaseName(rawBase) ||
      sanitizeBaseName(AppConfig.defaultOutputNames[defaultBaseKey]) ||
      "output";
    return `${base}.udatasmith`;
  }

  async function onRunSort() {
    clearLog();
    logLine("[01] Procesando…", "info");
    try {
      const file = document.getElementById("fileSort").files[0];
      if (!file) throw new Error("Selecciona NUEVO.udatasmith.");

      const outName = buildOutputFilename("outBaseSort", "sortedBase");

      logLine(`Entrada: ${file.name}`, "muted");
      const xml = await readFileAsText(file);
      const result = sortAndPurgeUdatasmith(xml);
      logLine("OK Paso 01.", "ok");
      downloadText(result, outName);
      logLine(`Salida: ${outName}`, "ok");
    } catch (err) {
      logLine(`ERROR 01: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  async function onRunPipeline() {
    clearLog();
    logLine("[02] Procesando pipeline…", "info");
    try {
      const fOrig = document.getElementById("fileOrigPipeline").files[0];
      const fNew = document.getElementById("fileNewPipeline").files[0];
      if (!fOrig || !fNew) throw new Error("Selecciona ORIGINAL y NUEVO.");

      const outName = buildOutputFilename("outBasePipeline", "allInOneBase");

      logLine(`ORIGINAL: ${fOrig.name}`, "muted");
      logLine(`NUEVO: ${fNew.name}`, "muted");

      const [origXml, newXml] = await Promise.all([
        readFileAsText(fOrig),
        readFileAsText(fNew)
      ]);

      const sortedXml = sortAndPurgeUdatasmith(newXml);
      const { xml: mergedXml, usedIds } = runMerge(origXml, sortedXml);
      logLine("OK Pipeline.", "ok");

      if (AppConfig.ui.showIdSummaryInLog && usedIds.length) {
        logLine("IDs:", "muted");
        logLine(usedIds.join(", "), "muted");
      }

      downloadText(mergedXml, outName);
      logLine(`Salida: ${outName}`, "ok");
    } catch (err) {
      logLine(`ERROR 02: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  function initUI() {
    const h1 = document.getElementById("appTitle");
    if (h1 && AppConfig.appTitle) h1.textContent = AppConfig.appTitle;

    const bSort = document.getElementById("outBaseSort");
    const bPipe = document.getElementById("outBasePipeline");
    if (bSort && AppConfig.defaultOutputNames.sortedBase) {
      bSort.value = AppConfig.defaultOutputNames.sortedBase;
    }
    if (bPipe && AppConfig.defaultOutputNames.allInOneBase) {
      bPipe.value = AppConfig.defaultOutputNames.allInOneBase;
    }

    const btnSortRun = document.getElementById("btnRunSort");
    const btnPipeRun = document.getElementById("btnRunPipeline");
    const btnClear = document.getElementById("btnClearLog");

    if (btnSortRun) btnSortRun.addEventListener("click", onRunSort);
    if (btnPipeRun) btnPipeRun.addEventListener("click", onRunPipeline);
    if (btnClear) btnClear.addEventListener("click", () => clearLog());
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadAppConfig === "function") {
      loadAppConfig().finally(initUI);
    } else {
      initUI();
    }
  });
})();