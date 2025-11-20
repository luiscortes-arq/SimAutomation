// js/mergePipeline.js
// Paso 02 – Replace & Merge (mantener IDs / Timeline)
(function () {
  "use strict";

  const RE_ACTOR_BLOCK = /<Actor\b[^>]*>[\s\S]*?<\/Actor>/gi;
  const RE_ACTOR_NAME = /\bname=(?:"([^"]+)"|'([^']+)')/i;
  const RE_NAME_ATTR = /\bname=(?:"([^"]+)"|'([^']+)')/i;
  const RE_LABEL_ATTR = /\blabel=(?:"([^"]+)"|'([^']+)')/i;
  const RE_CHILDREN = /<children\b[^>]*>[\s\S]*?<\/children>/gi;
  const RE_ACTORMESH_GLOBAL =
    /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;

  const RE_ID = /\b([A-Za-z0-9]+)-(\d+)\b/i;

  const RE_METADATA_BLOCK = /<MetaData\b[^>]*?(?:\/>|>[\s\S]*?<\/MetaData>)/gi;
  const RE_METADATA_REF = /\breference=(?:"([^"]+)"|'([^']+)')/i;

  const RE_KVP_TYPE_TAG_GLOBAL =
    /<KeyValueProperty\b(?=[^>]*\bname\s*=\s*(?:"Element\*Type"|'Element\*Type'))[^>]*?(?:\/>|>[\s\S]*?<\/KeyValueProperty\s*>)/gi;

  const RE_ATTR_VAL = /\bval\s*=\s*(?:"([^"]+)"|'([^']+)')/i;

  function firstGroup(m, idx1 = 1, idx2 = 2) {
    return m[idx1] != null ? m[idx1] : m[idx2];
  }

  function parseIdFromText(t) {
    if (!t) return null;
    const m = RE_ID.exec(t);
    if (!m) return null;
    const prefix = String(m[1]).toUpperCase();
    const num = String(m[2]);
    const numNorm = num.length > 2 ? num : num.padStart(2, "0");
    return `${prefix}-${numNorm}`;
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
        const actormeshRegex =
          /<ActorMesh\b[^>]*?(?:\/>|>[\s\S]*?<\/ActorMesh>)/gi;
        const amMatches = inner.matchAll(actormeshRegex);
        for (const amMatch of amMatches) {
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

    return { idToActorId, idToActorMeshId };
  }

  function replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId) {
    return newXml.replace(RE_ACTORMESH_GLOBAL, (block) => {
      const nid = extractActorMeshId(block);
      if (!nid) return block;
      const origName = idToActorMeshId[nid];
      if (!origName) return block;

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

    if (RE_METADATA_REF.test(block)) {
      RE_METADATA_REF.lastIndex = 0;
      return block.replace(RE_METADATA_REF, (m, g1, g2) => {
        const quote = g1 != null ? '"' : "'";
        return `reference=${quote}${target}${quote}`;
      });
    }

    if (/<MetaData\b[^>]*?\/>/i.test(block)) {
      return block.replace(
        /(<MetaData\b)([^>]*?)\/>/i,
        (m, g1, g2) => `${g1} reference="Actor.${actorId}"${g2}/>`
      );
    }

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

  function runMerge(origXml, newXml) {
    const { idToActorId, idToActorMeshId } = buildOriginalMaps(origXml);
    const step1 = replaceActorMeshNamesWithOriginal(newXml, idToActorMeshId);
    const step2 = replaceMetadataReferenceWithOriginal(step1, idToActorId);
    const usedIdsSet = new Set([
      ...Object.keys(idToActorId),
      ...Object.keys(idToActorMeshId),
    ]);
    const usedIds = sortIds(Array.from(usedIdsSet));
    return { xml: step2, usedIds };
  }

  window.DatasmithMerge = { runMerge };
})();
