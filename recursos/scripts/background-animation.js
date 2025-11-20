// Animación desactivada por solicitud del usuario.
// El fondo ahora es estático y se maneja vía CSS en fondos.css.
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('fondo-ondas');
    if (container) {
        container.innerHTML = ''; // Limpiar cualquier contenido previo
    }
});
