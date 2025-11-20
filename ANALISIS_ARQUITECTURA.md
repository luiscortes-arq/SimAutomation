# Análisis de Arquitectura del Proyecto: Sim Automation

## 1. Estructura de Directorios y Archivos

El proyecto sigue una estructura modular organizada en recursos (estilos y scripts) y vistas.

### Raíz (`/`)

- `json/`: (Directorio creado) Almacenará datos estáticos o configuraciones en formato JSON.
- `vistas/`: Contiene las páginas HTML individuales que se cargarán dinámicamente o vía iframe.
- `recursos/`: Contiene los activos estáticos.

### Vistas (`vistas/`)

- `inicio.html`: Pantalla principal (Dashboard/Home).
- `log.html`: Pantalla de registro o historial.
- `purga.html`: Pantalla para la funcionalidad de "Purga".
- `reemplazar.html`: Pantalla para la funcionalidad de "Reemplazar".

### Estilos (`recursos/estilos/`)

- `base.css`: Normalización, reset y estilos globales base.
- `tema.css`: **Núcleo de diseño**. Definición de **CSS Variables** para colores (paletas Day/Night), tipografía y espaciado.
- `encabezado.css`: Estilos específicos para el header global.
- `pie.css`: Estilos específicos para el footer global.
- `utilidades.css`: Clases utilitarias (helpers).
- **Componentes** (`recursos/estilos/componentes/`):
  - `iconos.css`: Estilos para iconografía.
  - `contenedores.css`: Layouts y wrappers.
  - `elementos-ui.css`: Inputs, cards, etc.
  - `herramientas-botones.css`: Estilos de botones y acciones.

### Scripts (`recursos/scripts/`)

- `app.js`: Punto de entrada principal. Orquestador de la aplicación.
- `enrutador.js`: Manejo de la navegación. Responsable de cargar la vista correcta (posiblemente cambiando el `src` de un iframe o inyectando HTML).
- `tema.js`: Lógica para el cambio de tema (Day/Night) y persistencia de preferencias.
- `ui.js`: Manipulación del DOM, efectos visuales y manejo de eventos de UI generales.
- `archivos.js`: Manejo de operaciones de archivos (si aplica).

## 2. Responsabilidades Modulares y Lógica Técnica

### Sistema de Diseño (CSS Variables)

Se utilizará `tema.css` para definir las variables en `:root` y clases de tema (ej. `.tema-oscuro`, `.tema-claro`).

- **Paleta de Colores**: Se inferirá de los mockups (Naranja Hermosillo, Tonos oscuros para Night Mode, Blancos/Grises para Day Mode).
- **Tipografía**: Definida globalmente.

### Arquitectura de Navegación (Iframe + postMessage)

Dado el requerimiento de "lógica de <iframe> con postMessage", la arquitectura funcionará así:

1.  **Contenedor Principal**: `index.html` (o el punto de entrada) contendrá un `<iframe>` principal.
2.  **Carga de Vistas**: El `enrutador.js` cambiará el `src` del iframe para navegar entre `vistas/inicio.html`, `vistas/purga.html`, etc.
3.  **Comunicación (postMessage)**:
    - **Padre a Hijo**: El script principal (`app.js`) enviará mensajes al iframe (ej. cambio de tema, datos de usuario) usando `iframe.contentWindow.postMessage()`.
    - **Hijo a Padre**: Las vistas (`vistas/*.html`) enviarán mensajes al padre (ej. "navegar a ruta X", "acción completada") usando `window.parent.postMessage()`.

## 3. Estado Actual

- La estructura de archivos existe pero los archivos están vacíos.
- Se ha creado el directorio `json/`.
- Se han analizado los mockups visuales para proceder con la implementación de estilos.

## 4. Siguientes Pasos

1.  Implementar `tema.css` con las variables extraídas de los mockups.
2.  Construir la estructura HTML base en las vistas.
3.  Implementar la lógica de enrutamiento y comunicación iframe.
