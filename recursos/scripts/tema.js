// =============================================================
// TOGGLE DE TEMA – NOTAS FOR DUMMIES
// =============================================================
//
// OBJETIVO DEL SCRIPT
// -------------------
// Controla el botón que cambia entre “DAY / NIGHT”
// y sincroniza ese tema tanto en el documento principal
// como dentro del iframe donde están PURGA / REEMPLAZAR / LOG.
//
// CÓMO FUNCIONA
// -------------
// 1) Lee el tema guardado en localStorage (“claro” o “oscuro”).
// 2) Cambia clases en <body> para activar el CSS correcto.
// 3) Cambia el texto del botón (DAY / NIGHT).
// 4) Cambia el icono de Lucide (sun / moon).
// 5) Guarda el nuevo tema en localStorage.
// 6) Le manda un mensaje al iframe para que también cambie tema.
//
// TODO ESTE SCRIPT SE EJECUTA SOLO EN EL INDEX PRINCIPAL.
// =============================================================

document.addEventListener("DOMContentLoaded", () => {
  // ---------------------------------------------------------
  // REFERENCIAS A ELEMENTOS DEL DOM
  // ---------------------------------------------------------
  const btnTema = document.getElementById("btn-tema"); // Botón toggle principal
  const textoTema = btnTema.querySelector(".texto-tema"); // Texto pequeño (DAY/NIGHT)
  const iconoTema = btnTema.querySelector("i"); // Icono Lucide
  const body = document.body;
  const iframe = document.getElementById("vista-frame");

  // ---------------------------------------------------------
  // APLICAR TEMA INICIAL (leer desde localStorage)
  // ---------------------------------------------------------
  const temaGuardado = localStorage.getItem("tema");

  if (temaGuardado === "claro") {
    aplicarTemaClaro();
  } else {
    aplicarTemaOscuro(); // DEFAULT
  }

  // ---------------------------------------------------------
  // CLICK DEL BOTÓN – CAMBIAR TEMA
  // ---------------------------------------------------------
  btnTema.addEventListener("click", () => {
    if (body.classList.contains("tema-claro")) {
      aplicarTemaOscuro();
    } else {
      aplicarTemaClaro();
    }
  });

  // ---------------------------------------------------------
  // FUNCIÓN: APLICAR TEMA "DAY"
  // ---------------------------------------------------------
  function aplicarTemaClaro() {
    // Cambiar clases en el body
    body.classList.add("tema-claro");
    body.classList.remove("tema-oscuro");

    // Actualizar texto visible
    textoTema.textContent = "DAY";

    // Cambiar icono (Lucide)
    if (iconoTema) {
      iconoTema.setAttribute("data-lucide", "sun");
      if (window.lucide) lucide.createIcons(); // Regenerar SVGs
    }

    // Guardar preferencia
    localStorage.setItem("tema", "claro");

    // Notificar al iframe
    notificarIframe("claro");
  }

  // ---------------------------------------------------------
  // FUNCIÓN: APLICAR TEMA "NIGHT"
  // ---------------------------------------------------------
  function aplicarTemaOscuro() {
    body.classList.add("tema-oscuro");
    body.classList.remove("tema-claro");

    textoTema.textContent = "NIGHT";

    // Cambiar icono a luna
    if (iconoTema) {
      iconoTema.setAttribute("data-lucide", "moon");
      if (window.lucide) lucide.createIcons();
    }

    localStorage.setItem("tema", "oscuro");

    notificarIframe("oscuro");
  }

  // ---------------------------------------------------------
  // MANDAR MENSAJE AL IFRAME (HIJO)
  // ---------------------------------------------------------
  // Esto le dice a purga.html / reemplazar.html / log.html
  // que también cambien de tema.
  // IMPORTANTÍSIMO para sincronizar UI.
  // ---------------------------------------------------------
  function notificarIframe(tema) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { tipo: "CAMBIO_TEMA", tema: tema },
        "*"
      );
    }
  }
});
