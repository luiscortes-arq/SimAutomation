// js/Reemplazar.js
// REEMPLAZAR: Usa el NUEVO como base, inyecta IDs del ORIGINAL, purga y ordena

(function () {
  "use strict";

  // ============================================================
  // REGEX PATTERNS
  // ============================================================
  
  const RE_ACTOR_BLOCK = /<Actor\b[^>]*>[\s\S]*?<\/Actor>/gi;
  const RE_ACTOR_NAME = /\bname=(?:"([^"]+)|'([^']+)')/i;
  const RE_NAME_ATTR = /\bname=(?:"([^"]+)|'([^']+)')/i;
  const RE_LABEL_ATTR = /\blabel=(?:"([^"]+)|'([^']+)')/i;
  const RE_CHILDREN = /<children\b[^>]*>[\s\S]*?<\/children>/gi;
  const RE_ACTORMESH_GLOBAL = /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;
  const RE_STATICMESH_GLOBAL = /<StaticMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/StaticMesh>)/gi;

  // ID pattern: CO_01, SC_12, etc. (underscore o guión)
  const RE_ID = /\b([A-Za-z0-9]+)[-_](\d+)\b/i;

  const RE_METADATA_BLOCK = /<MetaData\b[^>]*?(?:\/>|>[\s\S]*?<\/MetaData>)/gi;
  const RE_METADATA_REF = /\breference=(?:"([^"]+)|'([^']+)')/i;
  
  // KeyValueProperty con Element*Type
  const RE_KVP_TYPE_TAG_GLOBAL =
    /<KeyValueProperty\b(?=[^>]*\bname\s*=\s*(?:"Element\*Type"|'Element\*Type'))[^>]*?(?:\/>|>[\s\S]*?<\/KeyValueProperty\s*>)/gi;
  
  const RE_ATTR_VAL = /\bval\s*=\s*(?:"([^"]+)|'([^']+)')/i;

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  
  function firstGroup(m, idx1 = 1, idx2 = 2) {
    return m[idx1] != null ? m[idx1] : m[idx2];
  }

  function parseIdFromText(t) {
    if (!t) return null;
    const m = RE_ID.exec(t);
    if (!m) return null;
    const prefix = String(m[1]).toUpperCase();
    const num = String(m[2]);
    // Normalizar a 2 dígitos mínimo
    const numNorm = num.length > 2 ? num : num.padStart(2, "0");
    return `${prefix}_${numNorm}`;  // Usar underscore
  }

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

  // ============================================================
  // BUILD MAPS FROM ORIGINAL
  // ============================================================

  function buildOriginalMaps(origXml) {
    const idToActorId = {};
    const idToActorMeshId = {};

    let actorMatch;
    RE_ACTOR_BLOCK.lastIndex = 0;
    while ((actorMatch = RE_ACTOR_BLOCK.exec(origXml)) !== null) {
      const actorBlock = actorMatch[0];
      const mName = RE_ACTOR_NAME.exec(actorBlock);
      if (!mName) continue;
      const actorId = firstGroup(mName);

      // Buscar children dentro del Actor
      let childrenMatch;
      RE_CHILDREN.lastIndex = 0;
      while ((childrenMatch = RE_CHILDREN.exec(actorBlock)) !== null) {
        const inner = childrenMatch[0];
        const actormeshRegex = /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;
        let amMatch;
        while ((amMatch = actormeshRegex.exec(inner)) !== null) {
          const amBlock = amMatch[0];
          const nid = extractActorMeshId(amBlock);
          if (!nid) continue;
          const nm = RE_NAME_ATTR.exec(amBlock);
          if (!nm) continue;
          const actormeshId = firstGroup(nm);
          if (!(nid in idToActorId)) idToActorId[nid] = actorId;
          if (!(nid in idToActorMeshId)) idToActorMeshId[nid] = actormeshId;
        }
      }
    }

    RE_ACTOR_BLOCK.lastIndex = 0;
    return { idToActorId, idToActorMeshId };
  }

  // ============================================================
  // INJECT IDs FROM ORIGINAL INTO NEW
  // ============================================================

  function replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId) {
    return newXml.replace(RE_ACTORMESH_GLOBAL, (block) => {
      const nid = extractActorMeshId(block);
      if (!nid) return block;
      const origName = idToActorMeshId[nid];
      if (!origName) return block;

      // Reemplazar name, preservando tipo de comillas
      return block.replace(RE_NAME_ATTR, (m, g1, g2) => {
        const quote = g1 != null ? '"' : "'";
        return `name=${quote}${origName}${quote}`;
      });
    });
  }

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

  function injectOrReplaceReference(block, actorId) {
    const target = `Actor.${actorId}`;

    // Si ya existe reference, reemplazarlo
    if (RE_METADATA_REF.test(block)) {
      RE_METADATA_REF.lastIndex = 0;
      return block.replace(RE_METADATA_REF, (m, g1, g2) => {
        const quote = g1 != null ? '"' : "'";
        return `reference=${quote}${target}${quote}`;
      });
    }

    // Si no existe, inyectarlo
    // Caso autocontenido: <MetaData ... />
    if (/<MetaData\b[^>]*?\/>/i.test(block)) {
      return block.replace(
        /(<MetaData\b)([^>]*?)\/>/i,
        (m, g1, g2) => `${g1} reference="Actor.${actorId}"${g2}/>`
      );
    }

    // Caso emparejado: <MetaData ...>...</MetaData>
    return block.replace(
      /(<MetaData\b)([^>]*?)>/i,
      (m, g1, g2) => `${g1} reference="Actor.${actorId}"${g2}>`
    );
  }

  function replaceMetadataReferenceWithOriginal(newXml, idToActorId) {
    return newXml.replace(RE_METADATA_BLOCK, (block) => {
      const nid = idFromMetadataBlock(block);
      if (!nid) return block;
      const actorId = idToActorId[nid];
      if (!actorId) return block;
      return injectOrReplaceReference(block, actorId);
    });
  }

  // ============================================================
  // SORTING
  // ============================================================

  function sortByLabel(xml) {
    // Extraer header (hasta el primer <Actor> o <StaticMesh>)
    const firstBlockMatch = xml.match(/<(?:Actor|StaticMesh)\b/);
    const headerEndIndex = firstBlockMatch ? firstBlockMatch.index : 0;
    const header = xml.substring(0, headerEndIndex);

    // Extraer footer (desde el último </Actor> o </StaticMesh>)
    const lastActorClose = xml.lastIndexOf("</Actor>");
    const lastStaticMeshClose = xml.lastIndexOf("</StaticMesh>");
    const lastCloseIndex = Math.max(lastActorClose, lastStaticMeshClose);

    let footer = "";
    if (lastCloseIndex > 0) {
      const footerStartIndex = lastActorClose > lastStaticMeshClose
        ? lastActorClose + "</Actor>".length
        : lastStaticMeshClose + "</StaticMesh>".length;
      footer = xml.substring(footerStartIndex);
    } else {
      footer = "\n</DatasmithUnrealScene>";
    }

    // Extraer todos los bloques Actor y StaticMesh
    const blocks = [];

    RE_ACTOR_BLOCK.lastIndex = 0;
    let match;
    while ((match = RE_ACTOR_BLOCK.exec(xml)) !== null) {
      const block = match[0];
      const label = extractLabel(block);
      blocks.push({ label, block, type: 'Actor' });
    }

    RE_STATICMESH_GLOBAL.lastIndex = 0;
    while ((match = RE_STATICMESH_GLOBAL.exec(xml)) !== null) {
      const block = match[0];
      const label = extractLabel(block);
      blocks.push({ label, block, type: 'StaticMesh' });
    }

    // Ordenar alfanuméricamente por label
    blocks.sort(compareAlphanumeric);

    // Reconstruir XML
    let body = "";
    for (const item of blocks) {
      body += "\n\t" + item.block;
    }

    return header + body + footer;
  }

  function extractLabel(block) {
    const m = RE_LABEL_ATTR.exec(block);
    return m ? firstGroup(m) : "";
  }

  function compareAlphanumeric(a, b) {
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
  }

  // ============================================================
  // MAIN PIPELINE
  // ============================================================

  function runMerge(origXml, newXml) {
    // Mapas del ORIGINAL
    const { idToActorId, idToActorMeshId } = buildOriginalMaps(origXml);

    // 1) En el NUEVO, fijar ActorMesh name con los del ORIGINAL
    let step1 = replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId);

    // 2) En el NUEVO, fijar MetaData reference="Actor.<id>" con los del ORIGINAL
    let step2 = replaceMetadataReferenceWithOriginal(step1, idToActorId);

    // 3) Ordenar por label
    let step3 = sortByLabel(step2);

    const usedIdsSet = new Set([
      ...Object.keys(idToActorId),
      ...Object.keys(idToActorMeshId)
    ]);

    return {
      xml: step3,
      modificados: usedIdsSet.size,
      purgados: 0
    };
  }

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

      // C: Merge (inyectar IDs del ORIGINAL al NUEVO limpio)
      let mergedXml = runMerge(origXml, cleanXml);

      // D: Reemplazos específicos
      mergedXml.xml = applySpecificReplacements(mergedXml.xml);

      return mergedXml;
    },
  };
})();
