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
  // PROCESO PRINCIPAL DEL MERGE:
  //
  // 1) buildOriginalMaps → lee IDs originales
  // 2) replaceActorMeshNamesWithOriginal → restaura nombres
  // 3) replaceMetadataReferenceWithOriginal → restaura reference="Actor.xxx"
  // 4) Devuelve XML final + lista de IDs usados.
  function runMerge(origXml, newXml) {
    const { idToActorId, idToActorMeshId } = buildOriginalMaps(origXml);

    // Reemplaza nombres de ActorMesh
    const step1 = replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId);

    // Repara Metadata reference
    const step2 = replaceMetadataReferenceWithOriginal(step1, idToActorId);

    // Arma lista de IDs
    const usedIdsSet = new Set([
      ...Object.keys(idToActorId),
      ...Object.keys(idToActorMeshId),
    ]);

    const usedIds = sortIds(Array.from(usedIdsSet));

    return { xml: step2, usedIds };
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
