document.addEventListener('DOMContentLoaded', () => {
    const btnTema = document.getElementById('btn-tema');
    const textoTema = btnTema.querySelector('.texto-tema');
    const iconoTema = btnTema.querySelector('i'); // Lucide icon element
    const body = document.body;
    const iframe = document.getElementById('vista-frame');

    // Cargar tema guardado
    const temaGuardado = localStorage.getItem('tema');
    if (temaGuardado === 'claro') {
        aplicarTemaClaro();
    } else {
        aplicarTemaOscuro();
    }

    btnTema.addEventListener('click', () => {
        if (body.classList.contains('tema-claro')) {
            aplicarTemaOscuro();
        } else {
            aplicarTemaClaro();
        }
    });

    function aplicarTemaClaro() {
        body.classList.add('tema-claro');
        body.classList.remove('tema-oscuro');
        textoTema.textContent = 'DAY';
        
        // Actualizar icono Lucide a Sun
        if (iconoTema) {
            iconoTema.setAttribute('data-lucide', 'sun');
            if (window.lucide) lucide.createIcons();
        }

        localStorage.setItem('tema', 'claro');
        notificarIframe('claro');
    }

    function aplicarTemaOscuro() {
        body.classList.add('tema-oscuro');
        body.classList.remove('tema-claro');
        textoTema.textContent = 'NIGHT';
        
        // Actualizar icono Lucide a Moon
        if (iconoTema) {
            iconoTema.setAttribute('data-lucide', 'moon');
            if (window.lucide) lucide.createIcons();
        }

        localStorage.setItem('tema', 'oscuro');
        notificarIframe('oscuro');
    }

    function notificarIframe(tema) {
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ tipo: 'CAMBIO_TEMA', tema: tema }, '*');
        }
    }
});
