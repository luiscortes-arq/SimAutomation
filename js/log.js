// js/log.js
(function () {
  "use strict"; // Activa el modo estricto de JS

  // Devuelve el elemento DOM donde se muestra el log
  function getLogElement() {
    return document.getElementById("log"); // Espera un <div id="log"> en HTML
  }

  // Agrega una línea al log visual
  function line(msg, kind = "info") {
    const logEl = getLogElement();
    if (!logEl) return; // Si no existe el contenedor, salir

    const span = document.createElement("span"); // Crea nueva línea
    // Asigna clase CSS según tipo de mensaje
    span.className =
      kind === "ok"
        ? "log-line-ok"
        : kind === "error"
        ? "log-line-error"
        : kind === "muted"
        ? "log-line-muted"
        : "log-line-info"; // por defecto

    span.textContent = msg + "\n"; // Agrega texto
    logEl.appendChild(span); // Inserta en el log
    logEl.scrollTop = logEl.scrollHeight; // Auto scroll hacia abajo
  }

  // Limpia completamente el log visual
  function clear() {
    const logEl = getLogElement();
    if (logEl) logEl.textContent = ""; // Borra contenido
  }

  // Expone funciones globalmente bajo window.Log
  window.Log = { line, clear };
})();
