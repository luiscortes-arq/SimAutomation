// js/mergePipeline.js
// Paso 02 – Replace & Merge (mantener IDs / Timeline)

// NOTE FOR DUMMIES:
// Este archivo toma:
//  - XML original (plantilla)
//  - XML nuevo ya ordenado
// Y hace 2 cosas principales:
//  1) Reemplaza nombres de ActorMesh en el nuevo por los originales (para mantener IDs únicos).
//  2) Repara las referencias <MetaData> para que apunten al Actor original correspondiente.
// Resultado: Twinmotion conserva la línea de tiempo y no rompe animaciones ni posiciones.

(function () {
  "use strict";

  // NOTE FOR DUMMIES:
  // Bloques y atributos que necesitamos localizar dentro del XML.
  const RE_ACTOR_BLOCK = /<Actor\b[^>]*>[\s\S]*?<\/Actor>/gi;
  const RE_ACTOR_NAME = /\bname=(?:"([^"]+)"|'([^']+)')/i;
  const RE_NAME_ATTR = /\bname=(?:"([^"]+)"|'([^']+)')/i;
  const RE_LABEL_ATTR = /\blabel=(?:"([^"]+)"|'([^']+)')/i;

  // NOTE FOR DUMMIES:
  // <children> ... </children> contiene las ActorMesh de cada Actor.
  const RE_CHILDREN = /<children\b[^>]*>[\s\S]*?<\/children>/gi;

  // NOTE FOR DUMMIES:
  // Localiza cualquier ActorMesh completo (con o sin contenido interno).
  const RE_ACTORMESH_GLOBAL =
    /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;

  // NOTE FOR DUMMIES:
  // Los IDs válidos tienen forma PREFIX-### → ejemplo: CO_444 → CO-444
  const RE_ID = /\b([A-Za-z0-9]+)-(\d+)\b/i;

  // NOTE FOR DUMMIES:
  // Se busca cualquier <MetaData ...> completo
  const RE_METADATA_BLOCK = /<MetaData\b[^>]*?(?:\/>|>[\s\S]*?<\/MetaData>)/gi;

  // NOTE FOR DUMMIES:
  // Donde está guardada la referencia Actor.id dentro de Metadata
  const RE_METADATA_REF = /\breference=(?:"([^"]+)"|'([^']+)')/i;

  // NOTE FOR DUMMIES:
  // Filtra propiedades <KeyValueProperty name="Element*Type">
  // Aquí encontramos IDs originales dentro de Metadata.
  const RE_KVP_TYPE_TAG_GLOBAL =
    /<KeyValueProperty\b(?=[^>]*\bname\s*=\s*(?:"Element\*Type"|'Element\*Type'))[^>]*?(?:\/>|>[\s\S]*?<\/KeyValueProperty\s*>)/gi;

  // NOTE FOR DUMMIES:
  // Extrae atributo val="XYZ"
  const RE_ATTR_VAL = /\bval\s*=\s*(?:"([^"]+)"|'([^']+)')/i;

  // NOTE FOR DUMMIES:
  // Devuelve el grupo capturado sin importar si estaba entre " " o ' '
  function firstGroup(m, idx1 = 1, idx2 = 2) {
    return m[idx1] != null ? m[idx1] : m[idx2];
  }

  // NOTE FOR DUMMIES:
  // Toma texto como "CO-4" o "CO-44" y lo normaliza a "CO-044".
  // Esto hace más estable la comparación.
  function parseIdFromText(t) {
    if (!t) return null;
    const m = RE_ID.exec(t);
    if (!m) return null;
    const prefix = String(m[1]).toUpperCase();
    const num = String(m[2]);
    const numNorm = num.length > 2 ? num : num.padStart(2, "0");
    return `${prefix}-${numNorm}`;
  }

  // NOTE FOR DUMMIES:
  // Analiza un ActorMesh y trata de sacar su ID real desde:
  // label="CO_444" o name="CO_444"
  // Luego lo normaliza a formato PREFIX-###.
  function extractActorMeshId(block) {
    let lab = RE_LABEL_ATTR.exec(block);
    if (lab) {
      const nid = parseIdFromText(firstGroup(lab));
      if (nid) return nid;
    }
    let nm = RE_NAME_ATTR.exec(block);
    if (nm) {
      const nid = parseIdFromText(firstGroup(nm));
      if (nid) return nid;
    }
    return null;
  }

  // NOTE FOR DUMMIES:
  // Recorre la PLANTILLA ORIGINAL y construye 2 mapas:
  //
  // idToActorId[nid]      → ID del Actor dueño del ActorMesh
  // idToActorMeshId[nid]  → name real del ActorMesh original
  //
  // Esto nos permite saber cómo se llamaba originalmente cada pieza del XML.
  function buildOriginalMaps(origXml) {
    const idToActorId = {};
    const idToActorMeshId = {};

    const actorMatches = origXml.matchAll(RE_ACTOR_BLOCK);
    for (const actorMatch of actorMatches) {
      const actorBlock = actorMatch[0];
      const mName = RE_ACTOR_NAME.exec(actorBlock);
      if (!mName) continue;
      const actorId = firstGroup(mName);

      const childrenMatches = actorBlock.matchAll(RE_CHILDREN);
      for (const childrenMatch of childrenMatches) {
        const inner = childrenMatch[0];

        // NOTE FOR DUMMIES:
        // Se crea un regex local nuevo porque matchAll de global no se resetea.
        const actormeshRegex =
          /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;

        const amMatches = inner.matchAll(actormeshRegex);
        for (const amMatch of amMatches) {
          const amBlock = amMatch[0];

          // ID normalizado (CO-444)
          const nid = extractActorMeshId(amBlock);
          if (!nid) continue;

          // name="f7f6ce..."
          const nm = RE_NAME_ATTR.exec(amBlock);
          if (!nm) continue;
          const actormeshId = firstGroup(nm);

          // Registra ID → Actor dueño
          if (!(nid in idToActorId)) idToActorId[nid] = actorId;

          // Registra ID → nombre original del ActorMesh
          if (!(nid in idToActorMeshId)) idToActorMeshId[nid] = actormeshId;
        }
      }
    }

    return { idToActorId, idToActorMeshId };
  }

  // NOTE FOR DUMMIES:
  // Toma el XML nuevo y reemplaza los name="" de ActorMesh
  // por los nombres originales de la plantilla, usando el mapa anterior.
  function replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId) {
    return newXml.replace(RE_ACTORMESH_GLOBAL, (block) => {
      const nid = extractActorMeshId(block);
      if (!nid) return block;

      const origName = idToActorMeshId[nid];
      if (!origName) return block;

      // Cambia name="xxxx" por name="ORIGINAL"
      return block.replace(RE_NAME_ATTR, (m, g1, g2) => {
        const quote = g1 != null ? '"' : "'";
        return `name=${quote}${origName}${quote}`;
      });
    });
  }

  // NOTE FOR DUMMIES:
  // Dentro de cada <MetaData> buscamos un KeyValueProperty name="Element*Type"
  // que contiene un val="CO-444" que identifica el ActorMesh correspondiente.
  function idFromMetadataBlock(block) {
    let m;
    RE_KVP_TYPE_TAG_GLOBAL.lastIndex = 0;

    while ((m = RE_KVP_TYPE_TAG_GLOBAL.exec(block)) !== null) {
      const kvText = m[0];
      const mv = RE_ATTR_VAL.exec(kvText);
      if (mv) {
        const val = firstGroup(mv);
        const nid = parseIdFromText(val);
        if (nid) return nid;
      }
    }
    return null;
  }

  // NOTE FOR DUMMIES:
  // Inserta o reemplaza la referencia dentro del tag MetaData:
  // referencia correcta → reference="Actor.<ID>"
  function injectOrReplaceReference(block, actorId) {
    const target = `Actor.${actorId}`;

    // Si ya existe reference="", se reemplaza
    if (RE_METADATA_REF.test(block)) {
      RE_METADATA_REF.lastIndex = 0;
      return block.replace(RE_METADATA_REF, (m, g1, g2) => {
        const quote = g1 != null ? '"' : "'";
        return `reference=${quote}${target}${quote}`;
      });
    }

    // Si es <MetaData ... />
    if (/<MetaData\b[^>]*?\/>/i.test(block)) {
      return block.replace(
        /(<MetaData\b)([^>]*?)\/>/i,
        (m, g1, g2) => `${g1} reference="Actor.${actorId}"${g2}/>`
      );
    }

    // Si es <MetaData ...> ... </MetaData>
    return block.replace(
      /(<MetaData\b)([^>]*?)>/i,
      (m, g1, g2) => `${g1} reference="Actor.${actorId}"${g2}>`
    );
  }

  // NOTE FOR DUMMIES:
  // Inserta la referencia correcta en TODOS los Metadata del XML nuevo.
  function replaceMetadataReferenceWithOriginal(newXml, idToActorId) {
    return newXml.replace(RE_METADATA_BLOCK, (block) => {
      const nid = idFromMetadataBlock(block);
      if (!nid) return block;

      const actorId = idToActorId[nid];
      if (!actorId) return block;

      return injectOrReplaceReference(block, actorId);
    });
  }

  // NOTE FOR DUMMIES:
  // Ordena IDs alfabética y numéricamente.
  function sortIds(ids) {
    const parse = (s) => {
      const idx = s.indexOf("-");
      if (idx === -1) return [s, Number.POSITIVE_INFINITY, s];
      const pfx = s.slice(0, idx);
      const rest = s.slice(idx + 1);
      const n = /^\d+$/.test(rest)
        ? parseInt(rest, 10)
        : Number.POSITIVE_INFINITY;
      return [pfx, n, rest];
    };

    return ids.slice().sort((a, b) => {
      const [pa, na, ra] = parse(a);
      const [pb, nb, rb] = parse(b);
      if (pa < pb) return -1;
      if (pa > pb) return 1;
      if (na < nb) return -1;
      if (na > nb) return 1;
      if (ra < rb) return -1;
      if (ra > rb) return 1;
      return 0;
    });
  }

    // NOTE FOR DUMMIES:
    // 4) Devuelve XML final + lista de IDs usados.
    function runMerge(origXml, newXml) {
      const { idToActorId, idToActorMeshId } = buildOriginalMaps(origXml);

      // Reemplaza nombres de ActorMesh
      let step1 = replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId);

      // Repara Metadata reference
      let step2 = replaceMetadataReferenceWithOriginal(step1, idToActorId);

      // ======================================================================
      // NUEVO PASO CRÍTICO: REORDENAR SEGÚN ORIGINAL
      // ======================================================================
      // NOTE FOR DUMMIES:
      // El usuario reportó que se pierde el orden y rompe Twinmotion.
      // Aquí forzamos que el XML resultante tenga EXACTAMENTE la misma secuencia
      // de <Actor> y <ActorMesh> que el original.
      step2 = reorderToMatchOriginal(origXml, step2);

      // Arma lista de IDs
      const usedIdsSet = new Set([
        ...Object.keys(idToActorId),
        ...Object.keys(idToActorMeshId),
      ]);

      const usedIds = sortIds(Array.from(usedIdsSet));

      return { xml: step2, usedIds };
    }

    // NOTE FOR DUMMIES:
    // Extrae el bloque completo de un Actor dado su ID (buscando por name="PREFIX-###")
    function extractActorBlock(xml, actorId) {
      // Regex para buscar <Actor ... name="ID" ...> ... </Actor>
      // Se asume que el ID está normalizado o tal cual viene en el XML nuevo.
      // El XML nuevo ya pasó por replaceActorMeshNamesWithOriginal, así que los nombres deberían coincidir.
      // Pero ojo: los Actors en el nuevo XML tienen el ID en el name.
      
      // Buscamos <Actor ... name="ACTOR_ID" ...>
      // Usamos una regex dinámica con cuidado.
      const re = new RegExp(`<Actor\\b[^>]*name=["']${actorId}["'][\\s\\S]*?<\\/Actor>`, "i");
      const m = re.exec(xml);
      return m ? m[0] : null;
    }

    // NOTE FOR DUMMIES:
    // Extrae el bloque completo de un ActorMesh dado su ID (name="ID")
    function extractActorMeshBlock(xml, meshId) {
      const re = new RegExp(`<ActorMesh\\b[^>]*name=["']${meshId}["'][\\s\\S]*?(?:\\/>|<\\/ActorMesh>)`, "i");
      const m = re.exec(xml);
      return m ? m[0] : null;
    }

    // NOTE FOR DUMMIES:
    // Reconstruye el XML nuevo siguiendo la estructura del original.
    function reorderToMatchOriginal(origXml, newXml) {
      // 1. Analizar estructura original (Orden de Actors y sus hijos)
      const structure = [];
      const actorMatches = origXml.matchAll(RE_ACTOR_BLOCK);
      
      for (const actorMatch of actorMatches) {
        const actorBlock = actorMatch[0];
        const mName = RE_ACTOR_NAME.exec(actorBlock);
        if (!mName) continue;
        const actorId = firstGroup(mName); // ID original (ej: CO-444)

        const children = [];
        // Buscar hijos dentro de este actor original
        const childrenBlockMatch = RE_CHILDREN.exec(actorBlock);
        if (childrenBlockMatch) {
            const childrenBlock = childrenBlockMatch[0];
            const meshMatches = childrenBlock.matchAll(RE_ACTORMESH_GLOBAL);
            for (const meshMatch of meshMatches) {
                const meshBlock = meshMatch[0];
                // Aquí necesitamos el ID. En el original, el ID puede estar en label o name.
                // Usamos extractActorMeshId que ya tenemos.
                const meshId = extractActorMeshId(meshBlock);
                if (meshId) children.push(meshId);
            }
        }
        structure.push({ actorId, children });
      }

      // 2. Crear mapa de bloques del XML NUEVO para acceso rápido
      // Esto es para no hacer regex search por cada elemento (lento).
      // Mejor extraemos todo lo que hay en el nuevo y lo guardamos.
      
      // Mapa: ActorID -> BloqueCompleto (sin children)
      // Mapa: ActorID -> Lista de Hijos (bloques)
      // Pero el XML nuevo tiene la estructura <Actor><children><ActorMesh>...</children></Actor>
      // Lo más fácil es "desarmar" el nuevo XML en objetos y luego rearmar string.
      
      // Estrategia simplificada:
      // Iterar la estructura original.
      // Para cada ActorID original:
      //    Buscar ese Actor en el NewXML.
      //    Si existe:
      //       Tomar su encabezado <Actor ...> y pie </Actor>.
      //       Tomar su bloque <children>.
      //       Dentro de children, reordenar los ActorMesh según la lista 'children' original.
      //       Si hay ActorMesh nuevos que no estaban en el original, ponerlos al final (o ignorarlos si es estricto).
      //       El usuario dijo "al original no le mueves nada", así que el orden manda.
      //    Si no existe en NewXML: ¿Lo ignoramos o lo copiamos del original?
      //       Normalmente en un merge, si no está en el nuevo es que se borró.
      //       Pero si es "Reemplazar", asumimos que el nuevo trae la info actualizada.
      //       Si falta en el nuevo, asumimos que se borró.
      
      let reconstructedXml = "";
      
      // Header del archivo (todo lo que está antes del primer Actor)
      // Asumimos que empieza con <Scene> o similar.
      const firstActorIndex = newXml.search(/<Actor\b/i);
      const header = firstActorIndex >= 0 ? newXml.substring(0, firstActorIndex) : "";
      reconstructedXml += header;

      // Procesar cada Actor en el orden original
      for (const item of structure) {
        const actorId = item.actorId;
        const originalChildrenIds = item.children;

        // Buscar este Actor en el NewXML
        const newActorBlock = extractActorBlock(newXml, actorId);
        
        if (newActorBlock) {
            // Tenemos el bloque del actor nuevo. Ahora hay que ordenar sus hijos.
            // Extraer partes del Actor nuevo
            const childrenMatch = RE_CHILDREN.exec(newActorBlock);
            
            if (childrenMatch) {
                const fullChildrenBlock = childrenMatch[0];
                const openChildrenTag = fullChildrenBlock.match(/^<children\b[^>]*>/i)[0];
                const closeChildrenTag = "</children>";
                
                // Extraer todos los meshes del nuevo actor
                const meshMap = {}; // ID -> Bloque HTML
                const meshes = fullChildrenBlock.matchAll(RE_ACTORMESH_GLOBAL);
                for (const m of meshes) {
                    const mb = m[0];
                    // En el newXml, los nombres YA fueron reemplazados por los IDs originales en el paso 1
                    // Así que buscamos name="ID"
                    const nm = RE_NAME_ATTR.exec(mb);
                    if (nm) {
                        const id = firstGroup(nm);
                        meshMap[id] = mb;
                    }
                }

                // Reconstruir bloque children ordenado
                let sortedChildrenContent = "";
                
                // 1. Poner los que coinciden con el orden original
                for (const childId of originalChildrenIds) {
                    if (meshMap[childId]) {
                        sortedChildrenContent += "\n\t\t\t" + meshMap[childId]; // Indentación básica
                        delete meshMap[childId]; // Marcar como usado
                    }
                }
                
                // 2. (Opcional) Poner los que sobran (nuevos en el XML nuevo)
                // El usuario dijo "respetar orden original". Si hay nuevos, ¿dónde van?
                // Lo lógico es al final.
                for (const remainingId in meshMap) {
                    sortedChildrenContent += "\n\t\t\t" + meshMap[remainingId];
                }

                // Reemplazar el bloque children dentro del actor block
                const newChildrenBlock = `${openChildrenTag}${sortedChildrenContent}\n\t\t${closeChildrenTag}`;
                const actorWithSortedChildren = newActorBlock.replace(RE_CHILDREN, newChildrenBlock);
                
                reconstructedXml += "\n\t" + actorWithSortedChildren;
            } else {
                // Actor sin hijos (raro pero posible), se agrega tal cual
                reconstructedXml += "\n\t" + newActorBlock;
            }
        } else {
            // El actor estaba en el original pero NO en el nuevo.
            // Significa que fue eliminado o filtrado. No lo agregamos.
        }
      }

      // Footer (todo lo que está después del último Actor)
      const lastActorMatch = newXml.match(/<\/Actor>([\s\S]*)$/i);
      // Esto es riesgoso si hay múltiples cierres. Mejor buscar el último </Actor>
      const lastActorIndex = newXml.lastIndexOf("</Actor>");
      if (lastActorIndex >= 0) {
          const footer = newXml.substring(lastActorIndex + 8);
          reconstructedXml += footer;
      } else {
          reconstructedXml += "</Scene>"; // Fallback
      }

      return reconstructedXml;
    }

    // NOTE FOR DUMMIES:
    // Reemplazos específicos solicitados por el usuario.
    // Ejemplo: Level_8mm_Head_L1 -> VDC MTY - 4D
    function applySpecificReplacements(xml) {
      return xml.replace(/Level_8mm_Head_L1/g, "VDC MTY - 4D");
    }

  // NOTE FOR DUMMIES:
  // API Global: Reemplazar.run(origXml, newXml)
  // Flujo: 1. Ordenar y Purgar (Purga.js) -> 2. Fusionar (Merge) -> 3. Reemplazos específicos
  window.Reemplazar = {
    run: function (origXml, newXml) {
      // A & B: Ordenar y Purgar
      // Se asume que window.Purga ya está cargado (purga.js)
      let cleanXml = window.Purga.run(newXml);

      // C: Merge
      let mergedXml = runMerge(origXml, cleanXml);

      // D: Reemplazos específicos
      mergedXml.xml = applySpecificReplacements(mergedXml.xml);

      return mergedXml;
    },
  };
})();
