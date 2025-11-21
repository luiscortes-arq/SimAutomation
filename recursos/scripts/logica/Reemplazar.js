// js/Reemplazar.js
// REEMPLAZAR: Fusión de XMLs manteniendo estructura Actor/ActorMesh del original

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
  // CORE LOGIC
  // ============================================================

  /**
   * Construye un mapa: label -> StaticMesh completo del newXml
   * Ejemplo: { "CO_01": "<StaticMesh name='abc123' ...>...</StaticMesh>" }
   */
  function buildStaticMeshMap(newXml) {
    const map = {};
    const matches = newXml.matchAll(RE_STATICMESH_BLOCK);
    
    for (const match of matches) {
      const block = match[0];
      const label = extractAttr(block, RE_LABEL_ATTR);
      const name = extractAttr(block, RE_NAME_ATTR);
      
      if (label && name) {
        map[label] = {
          block: block,
          name: name,  // Este es el hash del StaticMesh
        };
      }
    }
    
    return map;
  }

  /**
   * Busca el Transform dentro de un bloque de newXml por label
   */
  function findTransformByLabel(newXml, label) {
    // Primero intentar encontrar en StaticMesh
    const staticMeshes = [...newXml.matchAll(RE_STATICMESH_BLOCK)];
    for (const match of staticMeshes) {
      const block = match[0];
      const blockLabel = extractAttr(block, RE_LABEL_ATTR);
      if (blockLabel === label) {
        const transform = block.match(RE_TRANSFORM);
        return transform ? transform[0] : null;
      }
    }
    
    // Si no está en StaticMesh, buscar en ActorMesh
    const actorMeshes = [...newXml.matchAll(RE_ACTORMESH_BLOCK)];
    for (const match of actorMeshes) {
      const block = match[0];
      const blockLabel = extractAttr(block, RE_LABEL_ATTR);
      if (blockLabel === label) {
        const transform = block.match(RE_TRANSFORM);
        return transform ? transform[0] : null;
      }
    }
    
    return null;
  }

  /**
   * Actualiza un bloque ActorMesh:
   * 1. Cambia <mesh reference="old"/> por <mesh reference="new"/>
   * 2. Reemplaza <Transform> con el del newXml
   */
  function updateActorMesh(actorMeshBlock, newMeshName, newTransform) {
    let result = actorMeshBlock;
    
    // 1. Actualizar mesh reference
    if (newMeshName) {
      result = result.replace(RE_MESH_REF, `<mesh reference="${newMeshName}"/>`);
    }
    
    // 2. Actualizar Transform
    if (newTransform) {
      if (RE_TRANSFORM.test(result)) {
        // Si ya existe Transform, reemplazarlo
        result = result.replace(RE_TRANSFORM, newTransform);
      } else {
        // Si no existe, insertarlo antes del cierre
        result = result.replace(/(<\/ActorMesh>)/, `\n\t\t${newTransform}\n\t$1`);
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
  function processActorBlock(actorBlock, staticMeshMap, newXml) {
    let result = actorBlock;
    
    // Buscar todos los ActorMesh dentro de este Actor
    const actorMeshMatches = [...actorBlock.matchAll(RE_ACTORMESH_BLOCK)];
    
    for (const match of actorMeshMatches) {
      const originalActorMesh = match[0];
      const label = extractAttr(originalActorMesh, RE_LABEL_ATTR);
      
      if (!label) continue;
      
      // Buscar el StaticMesh correspondiente en newXml
      const staticMeshData = staticMeshMap[label];
      const newTransform = findTransformByLabel(newXml, label);
      
      // Actualizar el ActorMesh
      const updatedActorMesh = updateActorMesh(
        originalActorMesh,
        staticMeshData ? staticMeshData.name : null,
        newTransform
      );
      
      // Reemplazar en el resultado
      result = result.replace(originalActorMesh, updatedActorMesh);
    }
    
    return result;
  }

  /**
   * Función principal de fusión
   */
  function runMerge(origXml, newXml) {
    // 1. Construir mapa de StaticMesh del nuevo
    const staticMeshMap = buildStaticMeshMap(newXml);
    
    // 2. Extraer header del original (hasta el primer <Actor> o <StaticMesh>)
    const firstBlockMatch = origXml.match(/<(?:Actor|StaticMesh)\b/);
    const headerEndIndex = firstBlockMatch ? firstBlockMatch.index : 0;
    const header = origXml.substring(0, headerEndIndex);
    
    // 3. Extraer footer del original (desde el último </Actor> o </StaticMesh>)
    const lastActorClose = origXml.lastIndexOf("</Actor>");
    const lastStaticMeshClose = origXml.lastIndexOf("</StaticMesh>");
    const lastCloseIndex = Math.max(lastActorClose, lastStaticMeshClose);
    
    let footer = "";
    if (lastCloseIndex > 0) {
      const footerStartIndex = lastActorClose > lastStaticMeshClose 
        ? lastActorClose + "</Actor>".length
        : lastStaticMeshClose + "</StaticMesh>".length;
      footer = origXml.substring(footerStartIndex);
    } else {
      footer = "\n</DatasmithUnrealScene>";
    }
    
    // 4. Procesar todos los bloques Actor del original
    const processedActorsList = [];
    const actorMatches = [...origXml.matchAll(RE_ACTOR_BLOCK)];
    
    for (const match of actorMatches) {
      const actorBlock = match[0];
      const processedActor = processActorBlock(actorBlock, staticMeshMap, newXml);
      const label = extractAttr(processedActor, RE_LABEL_ATTR) || "";
      processedActorsList.push({ label, block: processedActor });
    }
    
    // 5. Procesar StaticMesh del original que no estén dentro de Actor
    const processedStaticMeshesList = [];
    const origStaticMeshMatches = [...origXml.matchAll(RE_STATICMESH_BLOCK)];
    
    for (const match of origStaticMeshMatches) {
      const staticMeshBlock = match[0];
      const label = extractAttr(staticMeshBlock, RE_LABEL_ATTR);
      
      // Si existe en newXml, usar el nuevo; si no, mantener el original
      if (label && staticMeshMap[label]) {
        processedStaticMeshesList.push({ label, block: staticMeshMap[label].block });
        // Marcar como procesado para no duplicar
        delete staticMeshMap[label];
      } else if (label) {
        processedStaticMeshesList.push({ label, block: staticMeshBlock });
      }
    }
    
    // 6. Agregar StaticMesh del newXml que no estaban en el original
    for (const label in staticMeshMap) {
      processedStaticMeshesList.push({ label, block: staticMeshMap[label].block });
    }
    
    // 7. ORDENAR ALFANUMÉRICAMENTE POR LABEL
    const compareAlphanumeric = (a, b) => {
      const labelA = a.label || "";
      const labelB = b.label || "";
      
      // Separar prefijo y número (ej: "CO_01" -> ["CO", "01"])
      const parseLabel = (lbl) => {
        const match = lbl.match(/^([A-Za-z]+)[-_](\d+)$/);
        if (match) {
          return { prefix: match[1].toUpperCase(), num: parseInt(match[2], 10) };
        }
        return { prefix: lbl.toUpperCase(), num: Number.POSITIVE_INFINITY };
      };
      
      const parsedA = parseLabel(labelA);
      const parsedB = parseLabel(labelB);
      
      // Primero comparar prefijos
      if (parsedA.prefix < parsedB.prefix) return -1;
      if (parsedA.prefix > parsedB.prefix) return 1;
      
      // Luego comparar números
      return parsedA.num - parsedB.num;
    };
    
    processedActorsList.sort(compareAlphanumeric);
    processedStaticMeshesList.sort(compareAlphanumeric);
    
    // 8. Reconstruir XML completo con bloques ordenados
    let processedActors = "";
    for (const item of processedActorsList) {
      processedActors += "\n\t" + item.block;
    }
    
    let processedStaticMeshes = "";
    for (const item of processedStaticMeshesList) {
      processedStaticMeshes += "\n\t" + item.block;
    }
    
    const result = header + processedActors + processedStaticMeshes + footer;
    
    return {
      xml: result,
      modificados: actorMatches.length + processedStaticMeshesList.length,
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
      // A & B: Ordenar y Purgar
      let cleanXml = window.Purga.run(newXml);

      // C: Merge
      let mergedXml = runMerge(origXml, cleanXml);

      // D: Reemplazos específicos
      mergedXml.xml = applySpecificReplacements(mergedXml.xml);

      return mergedXml;
    },
  };
})();
