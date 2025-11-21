// js/Reemplazar.js
// REEMPLAZAR: Usa la PLANTILLA como base, actualiza mesh ref + transform del NUEVO

(function () {
  "use strict";

  // ============================================================
  // REGEX PATTERNS
  // ============================================================
  
  const RE_LABEL_ATTR = /\blabel=(?:"([^"]+)|'([^']+)')/i;
  const RE_NAME_ATTR = /\bname=(?:"([^"]+)|'([^']+)')/i;
  
  // Extrae Transform completo
  const RE_TRANSFORM = /<Transform\b[^>]*>[\s\S]*?<\/Transform>/i;
  
  // Extrae mesh reference
  const RE_MESH_REF = /<mesh\b[^>]*\/>/i;
  
  // Bloques completos
  const RE_ACTOR_BLOCK = /<Actor\b[^>]*>[\s\S]*?<\/Actor>/gi;
  const RE_STATICMESH_BLOCK = /<StaticMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/StaticMesh>)/gi;
  const RE_ACTORMESH_BLOCK = /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;
  const RE_MATERIAL_BLOCK = /<Material\b[^>]*?(?:\/>|>[\s\S]*?<\/Material>)/gi;
  const RE_MATERIALINSTANCE_BLOCK = /<MaterialInstance\b[^>]*?(?:\/>|>[\s\S]*?<\/MaterialInstance>)/gi;
  const RE_TEXTURE_BLOCK = /<Texture\b[^>]*?(?:\/>|>[\s\S]*?<\/Texture>)/gi;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  function firstGroup(m, idx1 = 1, idx2 = 2) {
    return m[idx1] != null ? m[idx1] : m[idx2];
  }

  // Extrae el atributo de un match de regex
  function extractAttr(text, regex) {
    const m = regex.exec(text);
    return m ? firstGroup(m) : null;
  }

  // ============================================================
  // MAPEO DEL NUEVO XML
  // ============================================================

  /**
   * Construye mapas del NUEVO XML por label:
   * - label -> StaticMesh completo
   * - label -> mesh reference (hash)
   * - label -> Transform
   */
  function buildNewXmlMaps(newXml) {
    const staticMeshMap = {};
    const meshRefMap = {};
    const transformMap = {};
    
    // Mapear StaticMesh
    const staticMeshes = [...newXml.matchAll(RE_STATICMESH_BLOCK)];
    for (const match of staticMeshes) {
      const block = match[0];
      const label = extractAttr(block, RE_LABEL_ATTR);
      const name = extractAttr(block, RE_NAME_ATTR);
      const transform = block.match(RE_TRANSFORM);
      
      if (label) {
        staticMeshMap[label] = block;
        if (name) meshRefMap[label] = name;
        if (transform) transformMap[label] = transform[0];
      }
    }
    
    // Mapear ActorMesh (por si hay transforms ahí)
    const actorMeshes = [...newXml.matchAll(RE_ACTORMESH_BLOCK)];
    for (const match of actorMeshes) {
      const block = match[0];
      const label = extractAttr(block, RE_LABEL_ATTR);
      const transform = block.match(RE_TRANSFORM);
      
      if (label && transform && !transformMap[label]) {
        transformMap[label] = transform[0];
      }
    }
    
    return { staticMeshMap, meshRefMap, transformMap };
  }

  /**
   * Extrae Materials, Textures, etc. del NUEVO
   */
  function extractNonActorElements(newXml) {
    const elements = [];
    
    // Materials
    const materials = [...newXml.matchAll(RE_MATERIAL_BLOCK)];
    for (const match of materials) {
      elements.push(match[0]);
    }
    
    // MaterialInstance
    const materialInstances = [...newXml.matchAll(RE_MATERIALINSTANCE_BLOCK)];
    for (const match of materialInstances) {
      elements.push(match[0]);
    }
    
    // Textures
    const textures = [...newXml.matchAll(RE_TEXTURE_BLOCK)];
    for (const match of textures) {
      elements.push(match[0]);
    }
    
    return elements;
  }

  // ============================================================
  // ACTUALIZACIÓN DE ACTORMESH
  // ============================================================

  /**
   * Actualiza un bloque ActorMesh:
   * PRESERVA TODO del original (name, label, MetaData, etc.)
   * SOLO actualiza:
   * 1. <mesh reference="..."/> -> nuevo hash
   * 2. <Transform>...</Transform> -> nuevo transform
   */
  function updateActorMesh(actorMeshBlock, newMeshRef, newTransform) {
    let result = actorMeshBlock;
    
    // 1. Actualizar mesh reference (si existe nuevo)
    if (newMeshRef && RE_MESH_REF.test(result)) {
      result = result.replace(RE_MESH_REF, `<mesh reference="${newMeshRef}"/>`);
    }
    
    // 2. Actualizar Transform (si existe nuevo)
    if (newTransform) {
      if (RE_TRANSFORM.test(result)) {
        // Si ya existe Transform, reemplazarlo
        result = result.replace(RE_TRANSFORM, newTransform);
      } else {
        // Si no existe, insertarlo antes del cierre de ActorMesh
        if (result.includes('</ActorMesh>')) {
          result = result.replace('</ActorMesh>', `\t${newTransform}\n\t</ActorMesh>`);
        }
      }
    }
    
    return result;
  }

  /**
   * Procesa un bloque Actor completo:
   * - Extrae todos los ActorMesh
   * - Actualiza cada ActorMesh con datos del newXml
   * - Reconstruye el Actor
   */
  function processActorBlock(actorBlock, meshRefMap, transformMap) {
    let result = actorBlock;
    
    // Buscar todos los ActorMesh dentro de este Actor
    const actorMeshMatches = [...actorBlock.matchAll(RE_ACTORMESH_BLOCK)];
    
    for (const match of actorMeshMatches) {
      const originalActorMesh = match[0];
      const label = extractAttr(originalActorMesh, RE_LABEL_ATTR);
      
      if (!label) continue;
      
      // Buscar datos correspondientes en newXml
      const newMeshRef = meshRefMap[label];
      const newTransform = transformMap[label];
      
      // Actualizar el ActorMesh
      const updatedActorMesh = updateActorMesh(
        originalActorMesh,
        newMeshRef,
        newTransform
      );
      
      // Reemplazar en el resultado
      result = result.replace(originalActorMesh, updatedActorMesh);
    }
    
    return result;
  }

  // ============================================================
  // ORDENAMIENTO
  // ============================================================

  function sortByLabel(blocks) {
    return blocks.sort((a, b) => {
      const labelA = a.label || "";
      const labelB = b.label || "";

      // Parsear label: "CO_01" -> { prefix: "CO", num: 1 }
      const parseLabel = (lbl) => {
        const match = lbl.match(/^([A-Za-z0-9]+)[-_](\d+)$/);
        if (match) {
          return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10) };
        }
        return { prefix: lbl.toUpperCase(), num: Number.POSITIVE_INFINITY };
      };

      const parsedA = parseLabel(labelA);
      const parsedB = parseLabel(labelB);

      // Comparar prefijos
      if (parsedA.prefix < parsedB.prefix) return -1;
      if (parsedA.prefix > parsedB.prefix) return 1;

      // Comparar números
      return parsedA.num - parsedB.num;
    });
  }

  // ============================================================
  // FUNCIÓN PRINCIPAL DE FUSIÓN
  // ============================================================

  function runMerge(origXml, newXml) {
    // 1. Construir mapas del NUEVO
    const { staticMeshMap, meshRefMap, transformMap } = buildNewXmlMaps(newXml);
    const nonActorElements = extractNonActorElements(newXml);
    
    // 2. Extraer header del original
    const firstBlockMatch = origXml.match(/<(?:Actor|StaticMesh)\b/);
    const headerEndIndex = firstBlockMatch ? firstBlockMatch.index : 0;
    const header = origXml.substring(0, headerEndIndex);
    
    // 3. Procesar todos los bloques Actor del ORIGINAL
    const processedActorsList = [];
    const actorMatches = [...origXml.matchAll(RE_ACTOR_BLOCK)];
    
    let modificados = 0;
    for (const match of actorMatches) {
      const actorBlock = match[0];
      const processedActor = processActorBlock(actorBlock, meshRefMap, transformMap);
      const label = extractAttr(processedActor, RE_LABEL_ATTR) || "";
      processedActorsList.push({ label, block: processedActor });
      
      // Contar modificados si hubo cambio
      if (processedActor !== actorBlock) modificados++;
    }
    
    // 4. PRESERVAR StaticMesh del ORIGINAL y actualizar/agregar del NUEVO
    const staticMeshList = [];
    const origStaticMeshes = [...origXml.matchAll(RE_STATICMESH_BLOCK)];
    const processedLabels = new Set();
    
    // Primero: Procesar StaticMesh del ORIGINAL
    for (const match of origStaticMeshes) {
      const origBlock = match[0];
      const label = extractAttr(origBlock, RE_LABEL_ATTR);
      
      if (label) {
        // Si existe versión nueva, usar la nueva; si no, mantener la original
        if (staticMeshMap[label]) {
          staticMeshList.push({ label, block: staticMeshMap[label] });
          processedLabels.add(label);
        } else {
          staticMeshList.push({ label, block: origBlock });
        }
      } else {
        // StaticMesh sin label, mantener original
        staticMeshList.push({ label: "", block: origBlock });
      }
    }
    
    // Segundo: Agregar StaticMesh del NUEVO que no estaban en el ORIGINAL
    for (const label in staticMeshMap) {
      if (!processedLabels.has(label)) {
        staticMeshList.push({ label, block: staticMeshMap[label] });
      }
    }
    
    // 5. Ordenar Actors y StaticMesh por label
    sortByLabel(processedActorsList);
    sortByLabel(staticMeshList);
    
    // 6. Reconstruir XML
    let result = header;
    
    // Primero: Materials, Textures, etc. del NUEVO
    for (const element of nonActorElements) {
      result += "\n\t" + element;
    }
    
    // Segundo: Actors ordenados
    for (const item of processedActorsList) {
      result += "\n\t" + item.block;
    }
    
    // Tercero: StaticMesh ordenados (ORIGINAL + NUEVO)
    for (const item of staticMeshList) {
      result += "\n\t" + item.block;
    }
    
    // Footer
    result += "\n</DatasmithUnrealScene>";
    
    return {
      xml: result,
      modificados: modificados,
      purgados: 0
    };
  }

  /**
   * Reemplazos específicos del proyecto
   */
  function applySpecificReplacements(xml) {
    return xml.replace(/Level_8mm_Head_L1/g, "VDC MTY - 4D");
  }

  // ============================================================
  // API GLOBAL
  // ============================================================
  
  window.Reemplazar = {
    run: function (origXml, newXml) {
      // A & B: Ordenar y Purgar el NUEVO
      let cleanXml = window.Purga.run(newXml);

      // C: Merge (usar ORIGINAL como base, actualizar con NUEVO)
      let mergedXml = runMerge(origXml, cleanXml);

      // D: Reemplazos específicos
      mergedXml.xml = applySpecificReplacements(mergedXml.xml);

      return mergedXml;
    },
  };
})();
