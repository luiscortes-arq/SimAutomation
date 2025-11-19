// js/app.js
// Sort & Purge + Pipeline con lista de pares y ZIP, theme toggle + log detallado
(function () {
  "use strict";

  // ============================================================
  // DEPENDENCIAS GLOBALES
  // - AppConfig / loadAppConfig: config de la app (título, etc.)
  // - Log: módulo de log (line, clear, showSortDiff, showMergeDiff)
  // - DatasmithSort: lógica de Sort & Purge
  // - DatasmithMerge: lógica de Replace & Merge
  // ============================================================
  const { AppConfig, loadAppConfig } = window;
  const {
    line: logLine,
    clear: clearLog,
    showSortDiff,
    showMergeDiff,
  } = window.Log;
  const { sortAndPurgeUdatasmith } = window.DatasmithSort;
  const { runMerge } = window.DatasmithMerge;

  // Clave para guardar el tema (light / dark) en localStorage
  const THEME_KEY = "simautomation-theme";

  // ============================================================
  // HELPER: LEER ARCHIVOS COMO TEXTO
  // - Recibe un File (del input[type=file])
  // - Devuelve una Promise con el contenido de ese archivo en UTF-8
  // ============================================================
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

  // ============================================================
  // HELPER: DESCARGAR BLOB COMO ARCHIVO
  // ============================================================
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

  // ============================================================
  // HELPER: DESCARGAR TEXTO COMO .udatasmith (XML)
  // ============================================================
  function downloadText(text, filename) {
    const blob = new Blob([text], { type: "application/xml;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  // ============================================================
  // HELPER: LIMPIAR NOMBRE BASE DE ARCHIVO
  // - Quita la extensión
  // - Quita caracteres ilegales para nombres de archivo
  // ============================================================
  function sanitizeBaseName(name) {
    if (!name) return "";
    let s = name.trim();
    // Quitar extensión (.udatasmith, .xml, etc.)
    s = s.replace(/\.[^/.]+$/i, "");
    // Quitar caracteres no válidos en nombres de archivo
    s = s.replace(/[\\\/:"*?<>|]/g, "");
    return s || "";
  }

  // ============================================================
  // TEMA (LIGHT / DARK)
  // ============================================================
  function setTheme(theme) {
    const light = document.getElementById("theme-light");
    const dark = document.getElementById("theme-dark");
    const btn = document.getElementById("btnThemeToggle");
    if (!light || !dark) return;

    if (theme === "dark") {
      // Activar CSS oscuro, desactivar claro
      light.disabled = true;
      dark.disabled = false;
      document.documentElement.setAttribute("data-theme", "dark");
      if (btn) btn.textContent = "LIGHT";
    } else {
      // Activar CSS claro, desactivar oscuro
      light.disabled = false;
      dark.disabled = true;
      document.documentElement.setAttribute("data-theme", "light");
      if (btn) btn.textContent = "DARK";
    }

    // Guardar preferencia en localStorage (try/catch por si falla)
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  function initThemeFromStorage() {
    let theme = "light";
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === "dark" || stored === "light") theme = stored;
    } catch (e) {}
    setTheme(theme);
  }

  function toggleTheme() {
    const current =
      document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
  }

  // ============================================================
  // SORT & PURGE (TSP) — SOPORTA MÚLTIPLES ARCHIVOS
  //
  // IMPORTANTE (HTML):
  // <input id="fileSort" type="file" multiple>
  // - El atributo "multiple" es lo que permite seleccionar varios a la vez.
  // - Aquí en JS ya se lee como Array y se procesa uno por uno.
  // ============================================================
  async function onRunSort() {
    // Limpiar log central antes de empezar
    clearLog();

    try {
      // 1) Leer el input de archivos
      const input = document.getElementById("fileSort");

      // 2) Convertir FileList en Array para poder usar map/filter/etc.
      const files = input ? Array.from(input.files || []) : [];

      // Si el usuario no seleccionó nada, lanzamos error
      if (!files.length)
        throw new Error("Selecciona uno o varios ORIGINAL.udatasmith.");

      // Prefijo para los archivos procesados
      const prefix = "TSP_";

      // 3) Crear una lista de tareas (una por archivo)
      const tasks = files.map(async (file) => {
        // Leer XML como texto
        const originalXml = await readFileAsText(file);

        // Ejecutar Sort & Purge (lógica viene de window.DatasmithSort)
        const processedXml = sortAndPurgeUdatasmith(originalXml);

        // Mostrar log side-by-side para ESTE archivo
        showSortDiff(file.name, originalXml, processedXml);

        // Construir nombre de salida, limpiando base y agregando prefijo
        const baseName = sanitizeBaseName(file.name) || "file";
        const outName = `${prefix}${baseName}.udatasmith`;

        return { filename: outName, xml: processedXml };
      });

      // 4) Esperar a que todos los archivos terminen de procesarse
      const results = await Promise.all(tasks);

      // 5) Descarga:
      // - Si es 1 archivo => se descarga directo
      // - Si hay varios => si existe JSZip, se descarga un ZIP, si no, uno por uno
      if (results.length === 1) {
        const r = results[0];
        downloadText(r.xml, r.filename);
      } else if (window.JSZip) {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.filename, r.xml));
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, "TSP_Files.zip");
      } else {
        // Fallback: sin ZIP, descarga cada archivo por separado
        results.forEach((r) => downloadText(r.xml, r.filename));
      }

      // 6) Línea de log final (resumen)
      logLine(`Sort & Purge · archivos procesados: ${results.length}`, "muted");
    } catch (err) {
      // Si algo truena, registramos el error en el log visual y en la consola
      logLine(`ERROR Sort & Purge: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  // ============================================================
  // PIPELINE REPLACE & MERGE (TRM)
  //
  // Cada "job" es un par de archivos:
  //   - ORIGINAL (file-original)
  //   - NUEVO (file-new)
  //
  // Para múltiples pares:
  //   - Usar el botón "Agregar Par" (btnAddJob)
  //   - Cada par se procesa y se genera un TRM_....udatasmith
  //   - Todos se juntan en un ZIP si hay más de uno.
  // ============================================================

  // Crea una copia de la plantilla de job (par ORIGINAL + NUEVO)
  function createJobClone(index) {
    const container = document.getElementById("pipelineJobs");
    const base = container.querySelector(".pipeline-job-base");
    const clone = base.cloneNode(true);
    clone.classList.remove("pipeline-job-base");

    // Título tipo "Par 01", "Par 02", etc.
    const title = clone.querySelector(".job-title");
    if (title) title.textContent = `Par ${String(index).padStart(2, "0")}`;

    // Limpiamos los file inputs para que empiecen vacíos
    const files = clone.querySelectorAll('input[type="file"]');
    files.forEach((f) => (f.value = ""));

    // Mostrar botón de eliminar y conectar el evento
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

  // Renumerar los pares después de borrar alguno (Par 01, Par 02, ...)
  function renumberJobs() {
    const jobs = document.querySelectorAll(".pipeline-job");
    let idx = 1;
    jobs.forEach((job) => {
      const title = job.querySelector(".job-title");
      if (title) title.textContent = `Par ${String(idx++).padStart(2, "0")}`;
    });
  }

  // Asegura que el job base NO se pueda eliminar (siempre se mantiene uno mínimo)
  function ensureBaseJob() {
    const baseJob = document.querySelector(".pipeline-job-base");
    if (!baseJob) return;
    const removeBtn = baseJob.querySelector(".btn-remove-job");
    if (removeBtn) {
      removeBtn.style.visibility = "hidden";
      removeBtn.onclick = null;
    }
  }

  // Recolecta todos los jobs válidos (pares ORIGINAL + NUEVO con archivo cargado)
  function collectPipelineJobs() {
    const jobs = Array.from(document.querySelectorAll(".pipeline-job"));
    const valid = [];

    jobs.forEach((job) => {
      const fOrig = job.querySelector(".file-original");
      const fNew = job.querySelector(".file-new");

      // IMPORTANTE:
      // - Por ahora se usa SOLO el primer archivo de cada input (files[0]).
      // - Si quieres soportar múltiples por input, aquí habría que hacer pairing.
      const origFile = fOrig && fOrig.files[0];
      const newFile = fNew && fNew.files[0];

      if (origFile && newFile) {
        valid.push({ origFile, newFile });
      }
    });

    return valid;
  }

  // Ejecuta el pipeline Replace & Merge para todos los pares válidos
  async function onRunPipeline() {
    // Limpiar log antes de empezar
    clearLog();

    try {
      const jobs = collectPipelineJobs();
      if (!jobs.length)
        throw new Error("Agrega al menos un par ORIGINAL + NUEVO.");

      // usedNames: lleva control de nombres para evitar colisiones (TRM_A, TRM_A_1, etc.)
      const usedNames = {};

      // Construye un nombre de archivo único por cada par
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

      // Tareas: una por cada par ORIGINAL + NUEVO
      const tasks = jobs.map(async (job, idx) => {
        // Leer ambos archivos a la vez
        const [origXml, newXml] = await Promise.all([
          readFileAsText(job.origFile),
          readFileAsText(job.newFile),
        ]);

        // Primero ordenamos y purgamos el NUEVO con la misma lógica de Sort & Purge
        const sortedXml = sortAndPurgeUdatasmith(newXml);

        // Luego ejecutamos el merge con la lógica de DatasmithMerge
        const { xml: mergedXml } = runMerge(origXml, sortedXml);

        // Nombre de salida (TRM_...)
        const filename = buildOutName(job, idx);

        // Log side-by-side para este par
        const jobLabel = `Par ${idx + 1}`;
        showMergeDiff(
          jobLabel,
          job.origFile.name,
          job.newFile.name,
          newXml,
          mergedXml
        );

        return { filename, xml: mergedXml };
      });

      // Esperar a que todos los pares terminen
      const results = await Promise.all(tasks);

      // Descarga:
      // - 1 resultado => directo
      // - varios => ZIP si está JSZip, si no, cada uno
      if (results.length === 1) {
        const r = results[0];
        downloadText(r.xml, r.filename);
      } else if (window.JSZip) {
        const zip = new JSZip();
        results.forEach((r) => zip.file(r.filename, r.xml));
        const blob = await zip.generateAsync({ type: "blob" });
        downloadBlob(blob, "TRM_Files.zip");
      } else {
        results.forEach((r) => downloadText(r.xml, r.filename));
      }

      // Log resumen final
      logLine(`Replace & Merge · pares procesados: ${results.length}`, "muted");
    } catch (err) {
      logLine(`ERROR Replace & Merge: ${err.message || err}`, "error");
      console.error(err);
    }
  }

  // ============================================================
  // INICIALIZACIÓN DE UI
  // - Título de la app
  // - Job base del pipeline
  // - Botones: Sort, Pipeline, Clear, AddJob, ThemeToggle
  // ============================================================

  function initUI() {
    // Título principal (si AppConfig.appTitle está definido)
    const h1 = document.querySelector(".app-title");
    if (h1 && AppConfig.appTitle) h1.textContent = AppConfig.appTitle;

    // Asegurar que el job base no se pueda borrar
    ensureBaseJob();

    // Botones principales
    const btnSortRun = document.getElementById("btnRunSort");
    const btnPipeRun = document.getElementById("btnRunPipeline");
    const btnClear = document.getElementById("btnClear");
    const btnAddJob = document.getElementById("btnAddJob");
    const btnThemeToggle = document.getElementById("btnThemeToggle");

    // Click en "Run Sort & Purge"
    if (btnSortRun) btnSortRun.addEventListener("click", onRunSort);

    // Click en "Run Replace & Merge"
    if (btnPipeRun) btnPipeRun.addEventListener("click", onRunPipeline);

    // Click en "Clear Log"
    if (btnClear) btnClear.addEventListener("click", () => clearLog());

    // Click en "Agregar Par" del pipeline
    if (btnAddJob) {
      btnAddJob.addEventListener("click", () => {
        const count = document.querySelectorAll(".pipeline-job").length;
        createJobClone(count + 1);
      });
    }

    // Toggle de tema LIGHT / DARK
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener("click", toggleTheme);
    }

    // Inicializar tema desde localStorage
    initThemeFromStorage();
  }

  // ============================================================
  // ARRANQUE DE LA APLICACIÓN
  // - Espera DOMContentLoaded
  // - Carga config (si existe loadAppConfig)
  // - Luego inicializa UI
  // ============================================================
  document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadAppConfig === "function") {
      loadAppConfig().finally(initUI);
    } else {
      initUI();
    }
  });
})();
