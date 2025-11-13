// js/app.js
// Sort & Purge + Pipeline con lista de pares y ZIP, theme toggle
(function () {
  "use strict";

  const { AppConfig, loadAppConfig } = window;
  const { line: logLine, clear: clearLog } = window.Log;
  const { sortAndPurgeUdatasmith } = window.DatasmithSort;
  const { runMerge } = window.DatasmithMerge;

  const THEME_KEY = "simautomation-theme";

  /* === Helpers generales === */

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error("No se seleccionó archivo."));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error || new Error("Error al leer archivo."));
      reader.readAsText(file, "utf-8");
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "output.udatasmith";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "application/xml;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  function sanitizeBaseName(name) {
    if (!name) return "";
    let s = name.trim();
    s = s.replace(/\.[^/.]+$/i, "");
    s = s.replace(/[\\/:"*?<>|]/g, "");
    return s || "";
  }

  /* === Theme toggle === */

  function setTheme(theme) {
    const light = document.getElementById("theme-light");
    const dark = document.getElementById("theme-dark");
    const btn = document.getElementById("btnThemeToggle");
    if (!light || !dark) return;

    if (theme === "dark") {
      light.disabled = true;
      dark.disabled = false;
      document.documentElement.setAttribute("data-theme", "dark");
      if (btn) btn.textContent = "LIGHT";
    } else {
      light.disabled = false;
      dark.disabled = true;
      document.documentElement.setAttribute("data-theme", "light");
      if (btn) btn.textContent = "DARK";
    }

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // ignore
    }
  }

  function initThemeFromStorage() {
    let theme = "light";
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") theme = stored;
    } catch (e) {
      // ignore
    }
    setTheme(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
  }

  /* === Paso 01: Sort & Purge (multi-archivo, prefijo TSP_) === */

  async function onRunSort() {
    clearLog();
    logLine("[01] Sort & Purge (multi-archivo)…", "info");
    try {
      const input = document.getElementById("fileSort");
      const files = input ? Array.from(input.files || []) : [];
      if (!files.length)
        throw new Error("Selecciona uno o varios ORIGINAL.udatasmith.");

      const prefix = "TSP_";

      const tasks = files.map(async (file) => {
        const xml = await readFileAsText(file);
        const result = sortAndPurgeUdatasmith(xml);

        const baseName = sanitizeBaseName(file.name) || "file";
        const outName = `${prefix}${baseName}.udatasmith`;

        logLine(`OK Sort & Purge: ${file.name} → ${outName}`, "ok");
        return { filename: outName, xml: result };
      });

      const results = await Promise.all(tasks);

      if (results.length === 1) {
        const r = results[0];
        downloadText(r.xml, r.filename);
        logLine(`Salida única: ${r.filename}`, "ok");
      } else if (window.JSZip) {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.filename, r.xml));
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, "TSP_Files.zip");
        logLine(`ZIP generado (TSP_Files.zip) con ${results.length} archivos.`, "ok");
      } else {
        results.forEach((r) => downloadText(r.xml, r.filename));
        logLine(
          `Descargados ${results.length} archivos (sin ZIP, JSZip no disponible).`,
          "info"
        );
      }
    } catch (err) {
      logLine(`ERROR 01: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  /* === Pipeline (Replace & Merge de varios pares, prefijo TRM_) === */

  function createJobClone(index) {
    const container = document.getElementById("pipelineJobs");
    const base = container.querySelector(".pipeline-job-base");
    const clone = base.cloneNode(true);
    clone.classList.remove("pipeline-job-base");

    const title = clone.querySelector(".job-title");
    if (title) title.textContent = `Par ${String(index).padStart(2, "0")}`;

    const files = clone.querySelectorAll('input[type="file"]');
    files.forEach((f) => (f.value = ""));

    const removeBtn = clone.querySelector(".btn-remove-job");
    if (removeBtn) {
      removeBtn.style.visibility = "visible";
      removeBtn.addEventListener("click", () => {
        clone.remove();
        renumberJobs();
      });
    }

    container.appendChild(clone);
  }

  function renumberJobs() {
    const jobs = document.querySelectorAll(".pipeline-job");
    let idx = 1;
    jobs.forEach((job) => {
      const title = job.querySelector(".job-title");
      if (title) title.textContent = `Par ${String(idx++).padStart(2, "0")}`;
    });
  }

  function ensureBaseJob() {
    const baseJob = document.querySelector(".pipeline-job-base");
    if (!baseJob) return;
    const removeBtn = baseJob.querySelector(".btn-remove-job");
    if (removeBtn) {
      removeBtn.style.visibility = "hidden";
      removeBtn.onclick = null;
    }
  }

  function collectPipelineJobs() {
    const jobs = Array.from(document.querySelectorAll(".pipeline-job"));
    const valid = [];

    jobs.forEach((job) => {
      const fOrig = job.querySelector(".file-orig");
      const fNew = job.querySelector(".file-new");

      const origFile = fOrig && fOrig.files[0];
      const newFile = fNew && fNew.files[0];

      if (origFile && newFile) {
        valid.push({ origFile, newFile });
      }
    });

    return valid;
  }

  async function onRunPipeline() {
    clearLog();
    logLine("[02] Pipeline Replace & Merge…", "info");
    try {
      const jobs = collectPipelineJobs();
      if (!jobs.length)
        throw new Error("Agrega al menos un par ORIGINAL + NUEVO.");

      const usedNames = {};

      function buildOutName(job, index) {
        const baseFile =
          sanitizeBaseName(job.origFile && job.origFile.name) ||
          `Pair_${index + 1}`;
        let base = `TRM_${baseFile}`;
        let candidate = base;
        let i = 1;
        while (usedNames[candidate]) {
          candidate = `${base}_${i++}`;
        }
        usedNames[candidate] = true;
        return `${candidate}.udatasmith`;
      }

      const tasks = jobs.map(async (job, idx) => {
        const [origXml, newXml] = await Promise.all([
          readFileAsText(job.origFile),
          readFileAsText(job.newFile)
        ]);

        const sortedXml = sortAndPurgeUdatasmith(newXml);
        const { xml: mergedXml } = runMerge(origXml, sortedXml);
        const filename = buildOutName(job, idx);

        logLine(`OK Par ${idx + 1}: ${filename}`, "ok");
        return { filename, xml: mergedXml };
      });

      const results = await Promise.all(tasks);

      if (results.length === 1) {
        const r = results[0];
        downloadText(r.xml, r.filename);
        logLine(`Salida única: ${r.filename}`, "ok");
      } else if (window.JSZip) {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.filename, r.xml));
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, "TRM_Files.zip");
        logLine(
          `ZIP generado (TRM_Files.zip) con ${results.length} archivos.`,
          "ok"
        );
      } else {
        results.forEach((r) => downloadText(r.xml, r.filename));
        logLine(
          `Descargados ${results.length} archivos (sin ZIP, JSZip no disponible).`,
          "info"
        );
      }
    } catch (err) {
      logLine(`ERROR 02: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  /* === Init === */

  function initUI() {
    const h1 = document.querySelector(".app-title");
    if (h1 && AppConfig.appTitle) h1.textContent = AppConfig.appTitle;

    ensureBaseJob();

    const btnSortRun = document.getElementById("btnRunSort");
    const btnPipeRun = document.getElementById("btnRunPipeline");
    const btnClear = document.getElementById("btnClearLog");
    const btnAddJob = document.getElementById("btnAddJob");
    const btnThemeToggle = document.getElementById("btnThemeToggle");

    if (btnSortRun) btnSortRun.addEventListener("click", onRunSort);
    if (btnPipeRun) btnPipeRun.addEventListener("click", onRunPipeline);
    if (btnClear) btnClear.addEventListener("click", () => clearLog());
    if (btnAddJob) {
      btnAddJob.addEventListener("click", () => {
        const count = document.querySelectorAll(".pipeline-job").length;
        createJobClone(count + 1);
      });
    }
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener("click", toggleTheme);
    }

    initThemeFromStorage();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadAppConfig === "function") {
      loadAppConfig().finally(initUI);
    } else {
      initUI();
    }
  });
})();