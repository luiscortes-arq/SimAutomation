// ============================================
// Fondo de Ondas (JS)
// ============================================
// NOTAS FOR DUMMIES:
//
// Este archivo existía para animar el SVG del fondo,
// pero tú pediste desactivar TODA animación y dejarlo
// completamente estático.
//
// Por eso:
//
// 1) Esperamos a que cargue el DOM.
// 2) Buscamos el contenedor #fondo-ondas.
// 3) Lo limpiamos por si algún código previo o algún build
//    dejaba SVGs embebidos.
// 4) Todo el comportamiento visual ahora depende SOLO del CSS
//    en fondos.css.
//
// Si en un futuro quieres reactivar animaciones,
// puedes reactivar este script o reemplazarlo por un motor dedicado.
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("fondo-ondas");

  // Si existe el contenedor, lo limpiamos
  if (container) {
    container.innerHTML = "";
  }
});
