// =============================================================
// ENRUTADOR PRINCIPAL (PADRE) – NOTAS FOR DUMMIES
// =============================================================
//
// OBJETIVO:
// Controlar qué vista (HTML) se carga dentro del iframe,
// y actualizar el HEADER + COLOR DE ACENTO en el documento padre.
//
// CÓMO FUNCIONA:
// 1) Las vistas internas mandan mensajes al padre usando postMessage.
// 2) El padre detecta “NAVEGAR” y cambia el iframe a la vista solicitada.
// 3) También detecta el archivo cargado para sincronizar Back/Forward.
// 4) El padre actualiza el título y el color-acento global.
//
// TODO ESTO SE EJECUTA FUERA DEL IFRAME.
//
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
  const iframe = document.getElementById("vista-frame");

  // ---------------------------------------------------------
  // (A) ESCUCHAR MENSAJES DEL IFRAME (HIJO -> PADRE)
  // ---------------------------------------------------------
  window.addEventListener("message", (event) => {
    const data = event.data;

    if (data.tipo === "NAVEGAR") {
      console.log(`Navegando a: ${data.ruta}`);
      cargarVista(data.ruta); // Cambia el iframe

      // -----------------------------
      // DETERMINAR TITULO + COLOR
      // -----------------------------
      let titulo = "SIM AUTOMATION";
      let contexto = "inicio";
      let colorAcent = "var(--color-naranja)";

      if (data.ruta.includes("purga")) {
        titulo = "PURGA";
        contexto = "purga";
        colorAcent = "var(--color-verde)";
      } else if (data.ruta.includes("reemplazar")) {
        titulo = "REEMPLAZAR";
        contexto = "reemplazar";
        colorAcent = "var(--color-azul)";
      } else if (data.ruta.includes("log")) {
        titulo = "LOG";
        contexto = "log";
        colorAcent = "var(--color-amarillo)";
      }

      // Notificar al padre (si es necesario para otros handlers)
      window.parent.postMessage(
        {
          tipo: "ACTUALIZAR_CONTEXTO",
          titulo: titulo,
          contexto: contexto,
          colorAcent: colorAcent,
        },
        "*"
      );
    }
  });

  // ---------------------------------------------------------
  // (B) SINCRONIZACIÓN BACK/FORWARD – CADA VEZ QUE EL IFRAME CARGA
  // ---------------------------------------------------------
  iframe.addEventListener("load", () => {
    try {
      // pathname del archivo cargado dentro del iframe
      const ruta = iframe.contentWindow.location.pathname;
      const archivo = ruta.substring(ruta.lastIndexOf("/") + 1);

      let titulo = "SIM AUTOMATION";
      let colorAcent = "var(--color-naranja)";

      if (archivo.includes("purga")) {
        titulo = "PURGA";
        colorAcent = "var(--color-verde)";
      } else if (archivo.includes("reemplazar")) {
        titulo = "REEMPLAZAR";
        colorAcent = "var(--color-azul)";
      } else if (archivo.includes("log")) {
        titulo = "LOG";
        colorAcent = "var(--color-amarillo)";
      }

      // Actualizar el título directamente
      const tituloElement = document.querySelector(".titulo-app h1");
      if (tituloElement) tituloElement.textContent = titulo;

      // Actualizar color-acento global
      document.body.style.setProperty("--color-acento-actual", colorAcent);
    } catch (e) {
      console.warn(
        "No se pudo leer la URL interna del iframe (CORS local):",
        e
      );
    }
  });

  // ---------------------------------------------------------
  // (C) FUNCIÓN DE CARGA DE VISTA
  // ---------------------------------------------------------
  function cargarVista(ruta) {
    // Permite URLs con parámetros ?origen=purga
    const archivoBase = ruta.split("?")[0];

    if (archivoBase.endsWith(".html")) {
      iframe.src = `vistas/${ruta}`;
    } else {
      console.error("Ruta inválida:", ruta);
    }
  }
});
