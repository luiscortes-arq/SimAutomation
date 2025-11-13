// js/config.js
(function () {
  "use strict";

  const defaults = {
    appTitle: "Twinmotion Datasmith Pipeline (Web)",
    defaultOutputNames: {
      sortedBase: "sorted",
      mergedBase: "automation_sim",
      allInOneBase: "automation_sim"
    },
    ui: {
      showIdSummaryInLog: true
    }
  };

  window.AppConfig = defaults;

  window.loadAppConfig = async function loadAppConfig() {
    try {
      const resp = await fetch("config/app.config.json", { cache: "no-store" });
      if (!resp.ok) return;
      const cfg = await resp.json();
      if (!cfg || typeof cfg !== "object") return;

      if (cfg.appTitle) window.AppConfig.appTitle = cfg.appTitle;
      if (cfg.defaultOutputNames) {
        window.AppConfig.defaultOutputNames =
          Object.assign({}, window.AppConfig.defaultOutputNames, cfg.defaultOutputNames);
      }
      if (cfg.ui) {
        window.AppConfig.ui =
          Object.assign({}, window.AppConfig.ui, cfg.ui);
      }
    } catch (e) {
      // ignorar si no existe o se abre como file://
    }
  };
})();