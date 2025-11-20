// App.js: Orquestador principal

document.addEventListener('DOMContentLoaded', () => {
    console.log('Sim Automation App Iniciada');

    const iframe = document.getElementById('vista-frame');

    // Cuando el iframe carga, enviarle el tema actual
    iframe.addEventListener('load', () => {
        const temaActual = localStorage.getItem('tema') || 'oscuro'; // Default a oscuro si no hay nada
        
        // Pequeño delay para asegurar que el script del iframe esté listo
        setTimeout(() => {
            iframe.contentWindow.postMessage({ 
                tipo: 'CAMBIO_TEMA', 
                tema: temaActual 
            }, '*');
        }, 100);
    });
});
