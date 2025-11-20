// Enrutador: Maneja la navegación entre vistas dentro del iframe

document.addEventListener('DOMContentLoaded', () => {
    const iframe = document.getElementById('vista-frame');

    // Escuchar mensajes del iframe (Hijo -> Padre)
    window.addEventListener('message', (event) => {
        const data = event.data;

        if (data.tipo === 'NAVEGAR') {
            console.log(`Navegando a: ${data.ruta}`);
            cargarVista(data.ruta);
            
            // Notificar al padre para actualizar título y contexto de color
            let titulo = 'SIM AUTOMATION';
            let contexto = 'inicio';
            let colorAcento = 'var(--color-naranja)'; // Default

            if (data.ruta.includes('purga')) {
                titulo = 'PURGA';
                contexto = 'purga';
                colorAcento = 'var(--color-verde)';
            } else if (data.ruta.includes('reemplazar')) {
                titulo = 'REEMPLAZAR';
                contexto = 'reemplazar';
                colorAcento = 'var(--color-azul)';
            } else if (data.ruta.includes('log')) {
                titulo = 'LOG';
                contexto = 'log';
                colorAcento = 'var(--color-amarillo)';
            }
            
            window.parent.postMessage({ 
                tipo: 'ACTUALIZAR_CONTEXTO', 
                titulo: titulo,
                contexto: contexto,
                colorAcento: colorAcento
            }, '*');
        }
    });

    // Sincronización por Historial (Back/Forward)
    // Escuchar cuando el iframe carga una nueva página
    iframe.addEventListener('load', () => {
        try {
            const ruta = iframe.contentWindow.location.pathname;
            // Extraer el nombre del archivo
            const archivo = ruta.substring(ruta.lastIndexOf('/') + 1);
            
            // Reutilizar lógica de actualización
            let titulo = 'SIM AUTOMATION';
            let contexto = 'inicio';
            let colorAcento = 'var(--color-naranja)';

            if (archivo.includes('purga')) {
                titulo = 'PURGA';
                contexto = 'purga';
                colorAcento = 'var(--color-verde)';
            } else if (archivo.includes('reemplazar')) {
                titulo = 'REEMPLAZAR';
                contexto = 'reemplazar';
                colorAcento = 'var(--color-azul)';
            } else if (archivo.includes('log')) {
                titulo = 'LOG';
                contexto = 'log';
                colorAcento = 'var(--color-amarillo)';
            }

            // Actualizar UI del Padre directamente
            const tituloElement = document.querySelector('.titulo-app h1');
            if (tituloElement) tituloElement.textContent = titulo;
            document.body.style.setProperty('--color-acento-actual', colorAcento);

        } catch (e) {
            console.warn('No se pudo acceder a la ubicación del iframe (posible bloqueo CORS local):', e);
        }
    });

    function cargarVista(ruta) {
        // Permitir parámetros de consulta (ej: log.html?origen=purga)
        const archivoBase = ruta.split('?')[0];
        
        if (archivoBase.endsWith('.html')) {
            iframe.src = `vistas/${ruta}`;
        } else {
            console.error('Ruta inválida:', ruta);
        }
    }
});
