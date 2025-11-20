// App.js: Orquestador principal
// ============================================
// NOTAS FOR DUMMIES:
// Este archivo controla el arranque general de la app.
// Su trabajo es MUY simple:
//
// 1) Esperar a que cargue el DOM del index.html.
// 2) Detectar el iframe donde se cargan las vistas (purga, reemplazar, log, etc.).
// 3) Cuando el iframe termine de cargar su contenido interno,
//    le enviamos el tema actual (oscuro o claro).
//
// Así, cada vista sabe con qué tema debe renderizarse,
// sin depender del index directamente.
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  // Mensaje de consola para depuración
  console.log("Sim Automation App Iniciada");

  // Seleccionamos el iframe principal
  // Este iframe cambia según el botón que presiones en Home.
  const iframe = document.getElementById("vista-frame");

  // NOTA FOR DUMMIES:
  // El iframe por defecto NO recibe mensajes hasta que termina de cargar su HTML.
  // Por eso escuchamos el evento "load".
  iframe.addEventListener("load", () => {
    // Leemos el tema almacenado en localStorage.
    // Si nunca se ha seleccionado ninguno, tomamos "oscuro" como valor por defecto.
    const temaActual = localStorage.getItem("tema") || "oscuro";

    // NOTA FOR DUMMIES:
    // Algunas veces, el contenido interno del iframe aún no tiene listo su JS
    // en el milisegundo exacto en que se dispara “load”.
    // Este pequeño delay evita errores y asegura que reciba el postMessage.
    setTimeout(() => {
      iframe.contentWindow.postMessage(
        {
          tipo: "CAMBIO_TEMA", // Identificador para que el iframe sepa qué hacer
          tema: temaActual, // "oscuro" o "claro"
        },
        "*"
      );
    }, 100);
  });
});
