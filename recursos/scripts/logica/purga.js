(function () {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  // NOTA FOR DUMMIES:
  // Aquí defines reglas y listas de cosas permitidas, prohibidas o detectables.
  // Todo lo que está arriba se usa más abajo durante la limpieza del .udatasmith.

  // KeyValue permitidos dentro de <MetaData>
  const ALLOWED_KV_NAMES = new Set([
    "Label",
    "Actor.Name",
    "Actor.Label",
    "Actor.Path",
    "Actor.Tag",
    "Actor.Layer",
  ]);

  // Prefijos que indican flips de Revit. No sirven para Twinmotion.
  const TAG_REMIT_FAMILY_PREFIXES = [
    "Revit.DB.FamilyInstance.Mirrored.",
    "Revit.DB.FamilyInstance.HandFlipped.",
    "Revit.DB.FamilyInstance.FaceFlipped.",
  ];

  // Los valores exactos a eliminar si terminan en False
  const TAG_FALSE_VALUES = new Set(
    TAG_REMIT_FAMILY_PREFIXES.map((p) => p + "False")
  );

  // Cualquier StaticMesh / ActorMesh con estos nombres se elimina.
  const NOMBRES_A_ELIMINAR = new Set([
    "LEVEL_HEAD",
    "LEVEL-HEAD",
    "LEVEL HEAD",
  ]);

  // NOTA FOR DUMMIES:
  // Extrae solo el nombre del archivo sin ruta.
  const getRootPart = (s) =>
    String(s || "")
      .trim()
      .split(/[\\/|]+/) // corta paths tipo C:\folder\a\b o a/b/c
      .pop() || "";

  // NOTA FOR DUMMIES:
  // Convierte un nombre largo en uno corto tipo "CO_482"
  // a partir de su sufijo.
  const getMeshSuffix = (s) => {
    if (!s) return "";
    const parts = getRootPart(s).split("_").filter(Boolean);
    const [prev, last] = parts.slice(-2);
    const result = /^\d+$/.test(last) && prev ? `${prev}_${last}` : parts.pop() || "";
    // Normalizar guiones a underscores para que coincida con origXml
    return result.replace(/-/g, "_");
  };

  // NOTA FOR DUMMIES:
  // Normaliza strings a MAYÚSCULAS para comparaciones seguras.
  const normalizarNombreSimple = (s) =>
    s ? String(s).trim().toUpperCase() : "";

  // ============================================================
  // MAIN FUNCION: SORT & PURGE
  // Limpia, ordena, normaliza y reduce un .udatasmith
  // ============================================================
  function sortAndPurgeUdatasmith(xmlText) {
    // NOTA FOR DUMMIES:
    // Convertimos el texto XML en un DOM para manipularlo.
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("XML inválido o no se pudo parsear .udatasmith.");
    }

    const root = doc.documentElement;
    if (!root) {
      throw new Error("Documento .udatasmith sin raíz.");
    }

    // Helper para obtener tags rápidamente
    const byTag = (tag) => Array.from(doc.getElementsByTagName(tag));

    // ------------------------------------------------------------
    // 1) Eliminar StaticMesh / ActorMesh con nombres tipo LEVEL_HEAD
    // ------------------------------------------------------------
    // NOTA FOR DUMMIES:
    // Cualquier elemento cuyo name o label sea LEVEL_HEAD se borra.
    const eliminarPorNombre = (tag) => {
      byTag(tag).forEach((el) => {
        const nameNorm = normalizarNombreSimple(el.getAttribute("name"));
        const labelNorm = normalizarNombreSimple(el.getAttribute("label"));

        if (
          NOMBRES_A_ELIMINAR.has(nameNorm) ||
          NOMBRES_A_ELIMINAR.has(labelNorm) ||
          nameNorm.startsWith("LEVEL_HEAD") ||
          labelNorm.startsWith("LEVEL_HEAD")
        ) {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
      });
    };

    eliminarPorNombre("StaticMesh");
    eliminarPorNombre("ActorMesh");

    // ------------------------------------------------------------
    // 2) Normalizar label de StaticMesh → CO_444, CO_482, etc.
    // ------------------------------------------------------------
    byTag("StaticMesh").forEach((mesh) => {
      const lbl = mesh.getAttribute("label");
      if (lbl) mesh.setAttribute("label", getMeshSuffix(lbl));
    });

    // ------------------------------------------------------------
    // 3) Normalizar Actors (Actor, ActorMesh, ActorWhatever)
    // ------------------------------------------------------------
    // NOTA FOR DUMMIES:
    // - Los niveles mantienen su label fijo.
    // - Todo lo demás se reduce a sufijo.
    Array.from(doc.getElementsByTagName("*")).forEach((el) => {
      if (!/Actor/i.test(el.tagName)) return;

      const layer = el.getAttribute("layer") || "";
      const nm = el.getAttribute("name");
      const lbl = el.getAttribute("label");

      // name reducido, excepto Levels
      if (nm && layer !== "Levels") {
        // PROTECTED: No renombrar si es uno de los protegidos
        if (!["Site_Location", "Survey_Point", "Base_Point"].includes(nm)) {
             el.setAttribute("name", getMeshSuffix(nm));
        }
      }

      // label reducido, excepto Levels
      if (layer === "Levels") {
        el.setAttribute("label", "VDC MTY - 4D");
      } else if (lbl) {
        // PROTECTED: No renombrar si es uno de los protegidos
        if (!["Site_Location", "Survey_Point", "Base_Point"].includes(lbl)) {
            el.setAttribute("label", getMeshSuffix(lbl));
        }
      }
    });

    // ------------------------------------------------------------
    // 4) MaterialInstance label = layer automático
    // ------------------------------------------------------------
    // NOTA FOR DUMMIES:
    // MaterialInstance no tiene layer directo.
    // Lo inferimos siguiendo:
    //   MaterialInstance <- StaticMesh <- ActorMesh.layer

    // 4.1) Indexar MaterialInstance
    const allMaterialInstances = Array.from(
      doc.getElementsByTagName("MaterialInstance")
    );
    const materialByName = new Map();
    allMaterialInstances.forEach((mi) => {
      const name = mi.getAttribute("name");
      if (name) materialByName.set(name, mi);
    });

    // 4.2) StaticMesh → materiales
    const staticToMaterials = new Map();
    byTag("StaticMesh").forEach((sm) => {
      const smName = sm.getAttribute("name");
      if (!smName) return;

      const mats = Array.from(sm.getElementsByTagName("Material"));
      if (!mats.length) return;

      const names = mats.map((m) => m.getAttribute("name")).filter(Boolean);

      if (names.length) staticToMaterials.set(smName, names);
    });

    // 4.3) ActorMesh: layer → materiales indirectos
    const materialLayerMap = new Map();
    byTag("ActorMesh").forEach((actorMesh) => {
      const layer = actorMesh.getAttribute("layer");
      if (!layer) return;

      const meshRefs = Array.from(actorMesh.getElementsByTagName("mesh"));
      meshRefs.forEach((meshRef) => {
        const smName = meshRef.getAttribute("name");
        if (!smName) return;

        const mats = staticToMaterials.get(smName);
        if (!mats) return;

        mats.forEach((matName) => {
          if (!materialLayerMap.has(matName)) {
            materialLayerMap.set(matName, layer);
          }
        });
      });
    });

    // 4.4) Fallback: MaterialInstance dentro de un ActorMesh
    allMaterialInstances.forEach((mi) => {
      const matName = mi.getAttribute("name");
      if (!matName || materialLayerMap.has(matName)) return;

      let parent = mi.parentNode;
      while (
        parent &&
        parent.nodeType === 1 &&
        parent.tagName !== "ActorMesh"
      ) {
        parent = parent.parentNode;
      }

      if (parent && parent.tagName === "ActorMesh") {
        const layer = parent.getAttribute("layer");
        if (layer) materialLayerMap.set(matName, layer);
      }
    });

    // 4.5) Aplicar label = layer
    allMaterialInstances.forEach((mi) => {
      const matName = mi.getAttribute("name");
      if (!matName) return;

      const layer = materialLayerMap.get(matName);
      if (layer) mi.setAttribute("label", layer);
    });

    // ------------------------------------------------------------
    // 5) Limpieza de MetaData / KeyValue inválidos
    // ------------------------------------------------------------
    byTag("MetaData").forEach((md) => {
      Array.from(md.children).forEach((ch) => {
        if (ch.tagName !== "KeyValue") return;

        const kvName = ch.getAttribute("name");
        if (!kvName || !ALLOWED_KV_NAMES.has(kvName)) {
          md.removeChild(ch);
          return;
        }

        // Acortar rutas largas en Label o Name
        if (/Label$|Name$/.test(kvName)) {
          const val = ch.getAttribute("value");
          if (val) ch.setAttribute("value", getRootPart(val));
        }
      });
    });

    // ------------------------------------------------------------
    // 6) Eliminar <tag> que contienen flips de Revit
    // ------------------------------------------------------------
    Array.from(doc.getElementsByTagName("*")).forEach((elem) => {
      Array.from(elem.children).forEach((h) => {
        if (h.tagName !== "tag") return;

        const val = h.getAttribute("value") || "";
        const tienePrefijo = TAG_REMIT_FAMILY_PREFIXES.some((p) =>
          val.startsWith(p)
        );
        const esFalseExacto = TAG_FALSE_VALUES.has(val);

        if (tienePrefijo || esFalseExacto) {
          elem.removeChild(h);
        }
      });
    });

    // ------------------------------------------------------------
    // 7) Eliminar KeyValueProperty con Element* o Type*
    // ------------------------------------------------------------
    byTag("KeyValueProperty").forEach((kvp) => {
      const name = (kvp.getAttribute("name") || "").trim();
      if (name.startsWith("Element*") || name.startsWith("Type*")) {
        if (kvp.parentNode) {
          kvp.parentNode.removeChild(kvp);
        }
      }
    });

    // ------------------------------------------------------------
    // 7.5) ORDENAR NODOS (A. Ordenar basado en sufijo numérico)
    // ------------------------------------------------------------
    // Helper para parsear ID (copiado/adaptado de Reemplazar.js logic)
    const parseForSort = (s) => {
      if (!s) return ["", Number.POSITIVE_INFINITY, ""];
      const idx = s.indexOf("-");
      if (idx === -1) {
         // Intenta buscar _ si no hay -
         const idx2 = s.lastIndexOf("_");
         if (idx2 !== -1) {
             const pfx = s.slice(0, idx2);
             const rest = s.slice(idx2 + 1);
             const n = /^\d+$/.test(rest) ? parseInt(rest, 10) : Number.POSITIVE_INFINITY;
             return [pfx, n, rest];
         }
         return [s, Number.POSITIVE_INFINITY, s];
      }
      const pfx = s.slice(0, idx);
      const rest = s.slice(idx + 1);
      const n = /^\d+$/.test(rest)
        ? parseInt(rest, 10)
        : Number.POSITIVE_INFINITY;
      return [pfx, n, rest];
    };

    const sortChildren = (parent) => {
        const children = Array.from(parent.children);
        // Solo ordenamos si son elementos relevantes (Actors, etc)
        // O simplemente ordenamos todo por 'name' o 'label'
        children.sort((a, b) => {
            const nameA = a.getAttribute("label") || a.getAttribute("name") || "";
            const nameB = b.getAttribute("label") || b.getAttribute("name") || "";
            
            const [pa, na, ra] = parseForSort(nameA);
            const [pb, nb, rb] = parseForSort(nameB);
            
            if (pa < pb) return -1;
            if (pa > pb) return 1;
            if (na < nb) return -1;
            if (na > nb) return 1;
            if (ra < rb) return -1;
            if (ra > rb) return 1;
            return 0;
        });
        children.forEach(c => parent.appendChild(c));
    };

    // 4. Ordenar hijos del root (si se desea)
    // NOTE FOR DUMMIES:
    // Se ordenan alfabéticamente o por sufijo numérico para consistencia.
    // UPDATE: User requested NOT to reorder parent blocks.
    // sortChildren(root);
    
    // También ordenar hijos de Actors (ActorMesh)
    byTag("Actor").forEach(actor => {
        const childrenContainer = Array.from(actor.children).find(c => c.tagName === "children");
        if (childrenContainer) {
            sortChildren(childrenContainer);
        }
    });

    // ------------------------------------------------------------
    // 8) Serializar XML final limpio y ordenado
    // ------------------------------------------------------------
    // ------------------------------------------------------------
    // 8) Serializar XML final limpio y ordenado
    // ------------------------------------------------------------
    const serializer = new XMLSerializer();
    const xmlClean = serializer.serializeToString(doc);
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>\n';

    return (
      xmlDecl +
      xmlClean
        .split(/\r?\n/)
        .filter((line) => !/^\s*$/.test(line)) // elimina líneas vacías
        .join("\n")
    );
  }

  window.Purga = { run: sortAndPurgeUdatasmith };
})();
