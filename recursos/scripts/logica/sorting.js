(function () {
  "use strict";

  /**
   * ============================================================
   * NOTAS FOR DUMMIES:
   * ------------------------------------------------------------
   * Esta función toma:
   *   1) Un XML PLANTILLA ya purgado y ordenado.
   *   2) Un XML NUEVO generado por Revit/Twinmotion totalmente
   *      desordenado o mezclado.
   *
   * Y lo que hace es:
   *   - Leer el ORDEN EXACTO de la plantilla.
   *   - Buscar los mismos elementos en el XML nuevo.
   *   - Reordenarlos para que coincidan con la plantilla.
   *   - Cualquier elemento NUEVO (que no existe en la plantilla)
   *     se va al final del archivo.
   *
   * OJO:
   *   - No limpia ni purga nada por su cuenta.
   *   - Solo ordena basándose en el XML plantilla.
   *   - Esto es útil cuando la plantilla ya está muy optimizada
   *     después del proceso SORT & PURGE.
   * ============================================================
   */

  function sortNewBasedOnTemplate(templateXmlStr, newXmlStr) {
    // DOMParser para leer el XML en estructura manipulable
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    // Parseamos los dos XMLs (plantilla y nuevo)
    const templateDoc = parser.parseFromString(
      templateXmlStr,
      "application/xml"
    );
    const newDoc = parser.parseFromString(newXmlStr, "application/xml");

    // NOTA FOR DUMMIES:
    // Si cualquiera tiene error de parseo, abortamos.
    if (
      templateDoc.getElementsByTagName("parsererror").length > 0 ||
      newDoc.getElementsByTagName("parsererror").length > 0
    ) {
      throw new Error("Error al parsear los archivos XML.");
    }

    // ========================================================
    // 1. EXTRAER EL ORDEN DE LA PLANTILLA
    // ========================================================
    // NOTA FOR DUMMIES:
    // Solo se consideran los HIJOS DIRECTOS del nodo raíz.
    // Se crea un map tipo: "TagName|name" → índice de orden
    const templateOrder = new Map();
    const templateElements = Array.from(templateDoc.documentElement.children);

    templateElements.forEach((el, index) => {
      const name = el.getAttribute("name");

      // NOTA:
      // Solo indexamos elementos que tienen 'name'.
      if (name) {
        const key = `${el.tagName}|${name}`;
        templateOrder.set(key, index);
      }
    });

    // ========================================================
    // 2. PREPARAR EL XML NUEVO
    // ========================================================
    // NOTA FOR DUMMIES:
    // Aquí NO limpiamos ni purgamos el XML nuevo.
    // Eso ya debe venir hecho por DatasmithSort.sortAndPurgeUdatasmith.
    // Aquí solo ordenamos la estructura.

    const newRoot = newDoc.documentElement;
    const newElements = Array.from(newRoot.children);

    // ========================================================
    // 3. CLASIFICAR ELEMENTOS DEL XML NUEVO
    // ========================================================
    // NOTA FOR DUMMIES:
    //    - sortedElements  = existen en la plantilla → se ordenan.
    //    - unsortedElements = no existen en plantilla → se mandan al final.

    const sortedElements = [];
    const unsortedElements = [];

    newElements.forEach((el) => {
      const name = el.getAttribute("name");
      const key = `${el.tagName}|${name}`;

      if (templateOrder.has(key)) {
        // Insertamos índice temporal para luego ordenar
        el._sortIndex = templateOrder.get(key);
        sortedElements.push(el);
      } else {
        unsortedElements.push(el);
      }
    });

    // ========================================================
    // 4. ORDENAR LOS QUE SÍ COINCIDEN
    // ========================================================
    sortedElements.sort((a, b) => a._sortIndex - b._sortIndex);

    // ========================================================
    // 5. RECONSTRUIR EL XML NUEVO ORDENADO
    // ========================================================
    // NOTA FOR DUMMIES:
    // Primero borramos todo del root,
    // luego metemos:
    //   1) sortedElements en orden correcto
    //   2) unsortedElements al final
    while (newRoot.firstChild) {
      newRoot.removeChild(newRoot.firstChild);
    }

    sortedElements.forEach((el) => {
      delete el._sortIndex;
      newRoot.appendChild(el);
    });

    unsortedElements.forEach((el) => {
      newRoot.appendChild(el);
    });

    // ========================================================
    // 6. SERIALIZAR Y REGRESAR EL XML ORDENADO
    // ========================================================
    return serializer.serializeToString(newDoc);
  }

  // Exponemos la función globalmente
  window.DatasmithSorter = {
    sortNewBasedOnTemplate,
  };
})();
