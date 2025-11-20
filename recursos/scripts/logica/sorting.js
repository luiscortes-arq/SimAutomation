(function() {
    "use strict";

    /**
     * Ordena el XML nuevo basándose en el orden de los elementos del XML plantilla.
     * @param {string} templateXmlStr - Contenido del archivo plantilla (ya purgado y ordenado).
     * @param {string} newXmlStr - Contenido del archivo nuevo (desordenado).
     * @returns {string} - XML nuevo ordenado y purgado.
     */
    function sortNewBasedOnTemplate(templateXmlStr, newXmlStr) {
        const parser = new DOMParser();
        const serializer = new XMLSerializer();

        const templateDoc = parser.parseFromString(templateXmlStr, "application/xml");
        const newDoc = parser.parseFromString(newXmlStr, "application/xml");

        if (templateDoc.getElementsByTagName("parsererror").length > 0 || 
            newDoc.getElementsByTagName("parsererror").length > 0) {
            throw new Error("Error al parsear los archivos XML.");
        }

        // 1. Extraer el orden de la plantilla
        // Mapeamos: TagName + Name -> Índice
        const templateOrder = new Map();
        const templateElements = Array.from(templateDoc.documentElement.children);
        
        templateElements.forEach((el, index) => {
            const name = el.getAttribute("name");
            if (name) {
                const key = `${el.tagName}|${name}`;
                templateOrder.set(key, index);
            }
        });

        // 2. Preparar el documento nuevo
        // Primero aplicamos la purga estándar para limpiar basura (si aplica)
        // Nota: Asumimos que DatasmithSort está disponible globalmente o importado.
        // Si no, deberíamos replicar la lógica de limpieza básica aquí.
        // Por ahora, trabajaremos sobre los elementos directos.

        const newRoot = newDoc.documentElement;
        const newElements = Array.from(newRoot.children);

        // 3. Clasificar elementos del nuevo archivo
        const sortedElements = [];
        const unsortedElements = []; // Elementos nuevos que no están en la plantilla

        newElements.forEach(el => {
            const name = el.getAttribute("name");
            const key = `${el.tagName}|${name}`;
            
            if (templateOrder.has(key)) {
                el._sortIndex = templateOrder.get(key);
                sortedElements.push(el);
            } else {
                unsortedElements.push(el);
            }
        });

        // 4. Ordenar los coincidentes
        sortedElements.sort((a, b) => a._sortIndex - b._sortIndex);

        // 5. Reconstruir el árbol
        // Limpiar root
        while (newRoot.firstChild) {
            newRoot.removeChild(newRoot.firstChild);
        }

        // Insertar ordenados
        sortedElements.forEach(el => {
            delete el._sortIndex; // Limpiar propiedad temporal
            newRoot.appendChild(el);
        });

        // Insertar nuevos (al final)
        unsortedElements.forEach(el => {
            newRoot.appendChild(el);
        });

        // 6. Serializar
        return serializer.serializeToString(newDoc);
    }

    window.DatasmithSorter = {
        sortNewBasedOnTemplate
    };
})();
