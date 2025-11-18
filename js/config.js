// js/config.js
(function () {
  "use strict"; // Activa modo estricto para evitar errores silenciosos

  // Configuración por defecto de la app (fallback si no carga el archivo externo)
  const defaults = {
    appTitle: "Twinmotion Datasmith Pipeline (Web)", // Título visible de la aplicación

    defaultOutputNames: {
      sortedBase: "sorted", // Nombre base para archivos ordenados
      mergedBase: "automation_sim", // Nombre base para archivos fusionados
      allInOneBase: "automation_sim", // Nombre base para archivos todo-en-uno
    },

    ui: {
      showIdSummaryInLog: true, // Mostrar resumen de IDs en consola/log
    },
  };

  // Asignar configuración por defecto al objeto global
  window.AppConfig = defaults;

  // Función para cargar configuración externa (sobrescribe defaults)
  window.loadAppConfig = async function loadAppConfig() {
    try {
      // Carga archivo JSON externo sin cachear (importante para desarrollo)
      const resp = await fetch("config/app.config.json", { cache: "no-store" });
      if (!resp.ok) return; // Si no se pudo obtener el archivo, salir

      const cfg = await resp.json(); // Parsear JSON
      if (!cfg || typeof cfg !== "object") return;

      // Sobrescribir campos válidos
      if (cfg.appTitle) window.AppConfig.appTitle = cfg.appTitle;

      if (cfg.defaultOutputNames) {
        window.AppConfig.defaultOutputNames = Object.assign(
          {}, // Base vacía
          window.AppConfig.defaultOutputNames, // Defaults actuales
          cfg.defaultOutputNames // Config externa
        );
      }

      if (cfg.ui) {
        window.AppConfig.ui = Object.assign({}, window.AppConfig.ui, cfg.ui);
      }
    } catch (e) {
      // Ignorar errores (como si se abre con file:// o el archivo no existe)
    }
  };
})();
