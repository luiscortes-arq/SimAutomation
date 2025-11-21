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
  // AHORA SOPORTA StaticMesh EN LA RAIZ TAMBIÉN.
  const RE_ROOT_BLOCK = /(?:<Actor\b[^>]*>[\s\S]*?<\/Actor>|<StaticMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/StaticMesh>))/gi;
  
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
  // Recorre la PLANTILLA ORIGINAL y construye mapas.
  // AHORA TAMBIÉN CAPTURA LABELS DE ACTORS/ROOT ITEMS.
  function buildOriginalMaps(origXml) {
    const idToActorId = {};
    const idToActorMeshId = {};
    const idToActorMeshLabel = {};
    const idToRootLabel = {}; // ID -> Label del elemento raíz (Actor o StaticMesh)

    const rootMatches = origXml.matchAll(RE_ROOT_BLOCK);
    for (const match of rootMatches) {
      const block = match[0];
      
      // Intentar obtener ID del bloque raíz (por name)
      const mName = RE_NAME_ATTR.exec(block);
      if (!mName) continue;
      const rootId = firstGroup(mName);

      // Intentar obtener Label del bloque raíz
      const mLabel = RE_LABEL_ATTR.exec(block);
      if (mLabel) {
          // Usamos el ID del name como clave para guardar el label
          // Pero ojo: el ID que usamos para ordenar es el Label mismo?
          // No, usamos el Label para ordenar, pero necesitamos asociarlo al ID (name) para buscarlo luego.
          // Espera, el sort se hace sobre la estructura.
          idToRootLabel[rootId] = firstGroup(mLabel);
      }

      // Buscar hijos (si es Actor)
      const childrenMatches = block.matchAll(RE_CHILDREN);
      for (const childrenMatch of childrenMatches) {
        const inner = childrenMatch[0];
        const actormeshRegex = /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;
        const amMatches = inner.matchAll(actormeshRegex);
        for (const amMatch of amMatches) {
          const amBlock = amMatch[0];
          const nid = extractActorMeshId(amBlock);
          if (!nid) continue;

          const nm = RE_NAME_ATTR.exec(amBlock);
          if (!nm) continue;
          const actormeshId = firstGroup(nm);

          const lbl = RE_LABEL_ATTR.exec(amBlock);
          const actormeshLabel = lbl ? firstGroup(lbl) : null;

          if (!(nid in idToActorId)) idToActorId[nid] = rootId;
          if (!(nid in idToActorMeshId)) idToActorMeshId[nid] = actormeshId;
          if (actormeshLabel && !(nid in idToActorMeshLabel)) {
             idToActorMeshLabel[nid] = actormeshLabel;
          }
        }
      }
    }

    return { idToActorId, idToActorMeshId, idToActorMeshLabel, idToRootLabel };
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
  // Restaura el LABEL original de los ActorMesh/StaticMesh.
  // Esto es vital para que el Log no muestre cambios falsos de Label
  // y para cumplir con la regla de "respetar sintaxis original".
  function restoreActorMeshLabels(newXml, idToActorMeshLabel) {
    // Afecta tanto a ActorMesh como StaticMesh (si existieran sueltos, aunque aquí nos enfocamos en ActorMesh)
    return newXml.replace(RE_ACTORMESH_GLOBAL, (block) => {
      const nid = extractActorMeshId(block);
      if (!nid) return block;

      const origLabel = idToActorMeshLabel[nid];
      if (!origLabel) return block;

      // Si ya tiene label, lo reemplazamos. Si no, lo insertamos (aunque Purga siempre deja label).
      if (RE_LABEL_ATTR.test(block)) {
        return block.replace(RE_LABEL_ATTR, (m, g1, g2) => {
            const quote = g1 != null ? '"' : "'";
            return `label=${quote}${origLabel}${quote}`;
        });
      } else {
        // Insertar label antes del cierre
        return block.replace(/(\/?>)$/, ` label="${origLabel}"$1`);
      }
    });
  }

  // NOTE FOR DUMMIES:
  // Restaura el NAME original del ACTOR padre.
  // Purga.js renombra "Project_CO_01" a "CO_01".
  // Reemplazar.js necesita "Project_CO_01" para poder ordenar igual que la plantilla.
  // Versión corregida de restoreActorNames que recorre bloques
  function restoreActorNamesCorrected(newXml, idToActorId) {
      // Usamos un regex que capture bloques completos para poder buscar hijos
      return newXml.replace(RE_ROOT_BLOCK, (block) => {
        // Buscar algún hijo para saber quién es este Actor
        const childrenMatch = RE_CHILDREN.exec(block);
        if (!childrenMatch) return block; 

        const firstMeshMatch = RE_ACTORMESH_GLOBAL.exec(childrenMatch[0]);
        if (!firstMeshMatch) return block;

        const nid = extractActorMeshId(firstMeshMatch[0]);
        if (!nid) return block;

        const origActorName = idToActorId[nid];
        if (!origActorName) return block;

        // Reemplazar name="SHORT" por name="ORIGINAL" en el tag de apertura
        return block.replace(/^(<[a-zA-Z0-9]+\b[^>]*>)/, (openTag) => {
            return openTag.replace(RE_NAME_ATTR, (m, g1, g2) => {
                const quote = g1 != null ? '"' : "'";
                return `name=${quote}${origActorName}${quote}`;
            });
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

    // Comparador Alfanumérico para Labels
    const compareAlphanumeric = (labelA, labelB) => {
        if (!labelA) return 1;
        if (!labelB) return -1;
        
        const parse = (s) => {
          const parts = [];
          const re = /(\D+)|(\d+)/g;
          let match;
          while ((match = re.exec(s)) !== null) {
            if (match[1]) parts.push(match[1]);
            else parts.push(parseInt(match[2], 10));
          }
          return parts;
        };

        const pa = parse(labelA);
        const pb = parse(labelB);

        const len = Math.min(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
          if (pa[i] < pb[i]) return -1;
          if (pa[i] > pb[i]) return 1;
        }
        return pa.length - pb.length;
    };

    // NOTE FOR DUMMIES:
    // Ordena los bloques del XML Nuevo por su atributo label.
    // IMPORTANTE: Usa los bloques del newXml para preservar TODOS los IDs internos
    // que Twinmotion necesita para mantener la asociación (timeline, materials, etc.)
    function reconstructAndSort(origXml, newXml, idToRootLabel, idToActorMeshLabel) {
      // 1. Extraer bloques del newXml (ya procesado con IDs originales)
      const blocks = [];
      const rootMatches = newXml.matchAll(RE_ROOT_BLOCK);
      
      for (const match of rootMatches) {
        const block = match[0];
        const mName = RE_NAME_ATTR.exec(block);
        if (!mName) continue;
        const rootId = firstGroup(mName);
        
        // Buscar el label en nuestros mapas
        let label = idToRootLabel[rootId] || "";
        
        // Si no está en idToRootLabel, intentar extraerlo del bloque directamente
        if (!label) {
          const labelMatch = RE_LABEL_ATTR.exec(block);
          if (labelMatch) {
            label = firstGroup(labelMatch);
          }
        }

        blocks.push({ 
          id: rootId, 
          label: label, 
          content: block 
        });
      }

      // 2. ORDENAR bloques por label
      blocks.sort((a, b) => compareAlphanumeric(a.label, b.label));

      // 3. ORDENAR hijos dentro de cada bloque
      const sortedBlocks = blocks.map(item => {
        let blockContent = item.content;
        
        // Si tiene <children>, ordenar los ActorMesh dentro
        const childrenMatch = RE_CHILDREN.exec(blockContent);
        if (childrenMatch) {
          const childrenBlock = childrenMatch[0];
          const openTag = childrenBlock.match(/^<children\b[^>]*>/i)[0];
          const closeTag = "</children>";
          
          // Extraer todos los meshes
          const meshes = [];
          const meshMatches = childrenBlock.matchAll(RE_ACTORMESH_GLOBAL);
          for (const meshMatch of meshMatches) {
            const meshBlock = meshMatch[0];
            const nm = RE_NAME_ATTR.exec(meshBlock);
            if (!nm) continue;
            
            const meshId = firstGroup(nm);
            const nid = extractActorMeshId(meshBlock);
            let meshLabel = nid ? idToActorMeshLabel[nid] : "";
            
            // Si no está en el mapa, extraer del bloque
            if (!meshLabel) {
              const lbl = RE_LABEL_ATTR.exec(meshBlock);
              meshLabel = lbl ? firstGroup(lbl) : "";
            }
            
            meshes.push({ 
              label: meshLabel, 
              content: meshBlock 
            });
          }
          
          // Ordenar meshes por label
          meshes.sort((a, b) => compareAlphanumeric(a.label, b.label));
          
          // Reconstruir <children> con meshes ordenados
          let sortedChildren = openTag;
          for (const mesh of meshes) {
            sortedChildren += "\n\t\t\t" + mesh.content;
          }
          sortedChildren += "\n\t\t" + closeTag;
          
          // Reemplazar <children> en el bloque
          blockContent = blockContent.replace(RE_CHILDREN, sortedChildren);
        }
        
        return blockContent;
      });

      // 4. RECONSTRUIR XML completo
      // Header del newXml
      const firstBlockMatch = RE_ROOT_BLOCK.exec(newXml);
      const firstIndex = firstBlockMatch ? firstBlockMatch.index : 0;
      let result = newXml.substring(0, firstIndex);
      
      // Bloques ordenados
      for (const block of sortedBlocks) {
        result += "\n\t" + block;
      }
      
      // Footer del newXml
      let lastCloseIndex = -1;
      let m;
      const RE_ROOT_BLOCK_LOCAL = new RegExp(RE_ROOT_BLOCK.source, "gi");
      while ((m = RE_ROOT_BLOCK_LOCAL.exec(newXml)) !== null) {
        lastCloseIndex = m.index + m[0].length;
      }
      
      if (lastCloseIndex >= 0) {
        result += newXml.substring(lastCloseIndex);
      } else {
        result += "\n</DatasmithUnrealScene>";
      }

      return result;
    }

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
      const { idToActorId, idToActorMeshId, idToActorMeshLabel, idToRootLabel } = buildOriginalMaps(origXml);

      let step1 = replaceActorMeshNamesWithOriginal(cleanXml, idToActorMeshId);
      step1 = restoreActorMeshLabels(step1, idToActorMeshLabel);
      step1 = restoreActorNamesCorrected(step1, idToActorId);
      let step2 = replaceMetadataReferenceWithOriginal(step1, idToActorId);

      // RECONSTRUIR Y ORDENAR
      step2 = reconstructAndSort(origXml, step2, idToRootLabel, idToActorMeshLabel);

      // Arma lista de IDs
      const usedIdsSet = new Set([
        ...Object.keys(idToActorId),
        ...Object.keys(idToActorMeshId),
      ]);
      const usedIds = sortIds(Array.from(usedIdsSet));

      step2 = applySpecificReplacements(step2);

      return { xml: step2, usedIds };
    },
  };
})();
