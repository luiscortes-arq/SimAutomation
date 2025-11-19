(function () {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================
  const ALLOWED_KV_NAMES = new Set([
    "Label",
    "Actor.Name",
    "Actor.Label",
    "Actor.Path",
    "Actor.Tag",
    "Actor.Layer",
  ]);

  const TAG_REMIT_FAMILY_PREFIXES = [
    "Revit.DB.FamilyInstance.Mirrored.",
    "Revit.DB.FamilyInstance.HandFlipped.",
    "Revit.DB.FamilyInstance.FaceFlipped.",
  ];

  const TAG_FALSE_VALUES = new Set(
    TAG_REMIT_FAMILY_PREFIXES.map((p) => p + "False")
  );

  const NOMBRES_A_ELIMINAR = new Set([
    "LEVEL_HEAD",
    "LEVEL-HEAD",
    "LEVEL HEAD",
  ]);

  const getRootPart = (s) =>
    String(s || "")
      .trim()
      .split(/[\\/|]+/)
      .pop() || "";

  const getMeshSuffix = (s) => {
    if (!s) return "";
    const parts = getRootPart(s).split("_").filter(Boolean);
    const [prev, last] = parts.slice(-2);
    return /^\d+$/.test(last) && prev ? `${prev}_${last}` : parts.pop() || "";
  };

  const normalizarNombreSimple = (s) =>
    s ? String(s).trim().toUpperCase() : "";

  // ============================================================
  // MAIN
  // ============================================================
  function sortAndPurgeUdatasmith(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error("XML inválido o no se pudo parsear .udatasmith.");
    }

    const root = doc.documentElement;
    if (!root) {
      throw new Error("Documento .udatasmith sin raíz.");
    }

    const byTag = (tag) => Array.from(doc.getElementsByTagName(tag));

    // ------------------------------------------------------------
    // 1) Eliminar StaticMesh / ActorMesh con nombres tipo LEVEL_HEAD
    // ------------------------------------------------------------
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
    // 2) Normalizar label de StaticMesh -> sufijo corto
    // ------------------------------------------------------------
    byTag("StaticMesh").forEach((mesh) => {
      const lbl = mesh.getAttribute("label");
      if (lbl) mesh.setAttribute("label", getMeshSuffix(lbl));
    });

    // ------------------------------------------------------------
    // 3) Normalizar Actors (Actor, ActorMesh, etc.)
    // ------------------------------------------------------------
    Array.from(doc.getElementsByTagName("*")).forEach((el) => {
      if (!/Actor/i.test(el.tagName)) return;

      const layer = el.getAttribute("layer") || "";
      const nm = el.getAttribute("name");
      const lbl = el.getAttribute("label");

      // name: solo acortamos si NO es Levels
      if (nm && layer !== "Levels") {
        el.setAttribute("name", getMeshSuffix(nm));
      }

      // label: Levels tiene un label fijo, lo demás se acorta
      if (layer === "Levels") {
        el.setAttribute("label", "VDC MTY - 4D");
      } else if (lbl) {
        el.setAttribute("label", getMeshSuffix(lbl));
      }
    });

    // ------------------------------------------------------------
    // 4) MaterialInstance label = layer (AUTOMÁTICO)
    //    Relación: MaterialInstance <- StaticMesh <- ActorMesh.layer
    // ------------------------------------------------------------

    // 4.1) Indexar todos los MaterialInstance por name
    const allMaterialInstances = Array.from(
      doc.getElementsByTagName("MaterialInstance")
    );
    const materialByName = new Map();
    allMaterialInstances.forEach((mi) => {
      const name = mi.getAttribute("name");
      if (name) materialByName.set(name, mi);
    });

    // 4.2) StaticMesh: staticMeshName -> [materialName...]
    const staticToMaterials = new Map(); // StaticMesh.name -> [Material.name...]
    byTag("StaticMesh").forEach((sm) => {
      const smName = sm.getAttribute("name");
      if (!smName) return;

      const mats = Array.from(sm.getElementsByTagName("Material"));
      if (!mats.length) return;

      const matNames = [];
      mats.forEach((m) => {
        const matName = m.getAttribute("name");
        if (matName) matNames.push(matName);
      });

      if (matNames.length) {
        staticToMaterials.set(smName, matNames);
      }
    });

    // 4.3) ActorMesh: layer + <mesh name="staticMeshName">
    //      -> materialName -> layer
    const materialLayerMap = new Map(); // materialName -> layer

    byTag("ActorMesh").forEach((actorMesh) => {
      const layer = actorMesh.getAttribute("layer");
      if (!layer) return;

      const meshRefs = Array.from(actorMesh.getElementsByTagName("mesh"));
      meshRefs.forEach((meshRef) => {
        const smName = meshRef.getAttribute("name");
        if (!smName) return;

        const matNames = staticToMaterials.get(smName);
        if (!matNames) return;

        matNames.forEach((matName) => {
          // Si un material aparece en varias capas, se quedará con la primera que encuentre
          if (!materialLayerMap.has(matName)) {
            materialLayerMap.set(matName, layer);
          }
        });
      });
    });

    // 4.4) Extra: si algún MaterialInstance está anidado dentro de ActorMesh
    //      leemos su layer directo como fallback
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

      if (parent && parent.nodeType === 1 && parent.tagName === "ActorMesh") {
        const layer = parent.getAttribute("layer");
        if (layer) materialLayerMap.set(matName, layer);
      }
    });

    // 4.5) Aplicar label = layer a cada MaterialInstance que tenga layer mapeado
    allMaterialInstances.forEach((mi) => {
      const matName = mi.getAttribute("name");
      if (!matName) return;

      const layer = materialLayerMap.get(matName);
      if (layer) {
        mi.setAttribute("label", layer);
      }
      // Si no hay layer, NO tocamos el label original
    });

    // ------------------------------------------------------------
    // 5) Limpieza de <MetaData> / <KeyValue>
    // ------------------------------------------------------------
    byTag("MetaData").forEach((md) => {
      Array.from(md.children).forEach((ch) => {
        if (ch.tagName !== "KeyValue") return;

        const kvName = ch.getAttribute("name");
        if (!kvName || !ALLOWED_KV_NAMES.has(kvName)) {
          md.removeChild(ch);
          return;
        }

        if (/Label$|Name$/.test(kvName)) {
          const val = ch.getAttribute("value");
          if (val) {
            ch.setAttribute("value", getRootPart(val));
          }
        }
      });
    });

    // ------------------------------------------------------------
    // 6) Eliminar <tag> de Mirrored / HandFlipped / FaceFlipped
    // ------------------------------------------------------------
    Array.from(doc.getElementsByTagName("*")).forEach((elem) => {
      Array.from(elem.children).forEach((h) => {
        if (h.tagName !== "tag") return;

        const val = h.getAttribute("value") || "";
        const tienePrefijo = TAG_REMIT_FAMILY_PREFIXES.some((pref) =>
          val.startsWith(pref)
        );
        const esFalseExacto = TAG_FALSE_VALUES.has(val);

        if (tienePrefijo || esFalseExacto) {
          elem.removeChild(h);
        }
      });
    });

    // ------------------------------------------------------------
    // 7) Eliminar KeyValueProperty no deseados (Element*, Type*)
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
    // 8) Serializar XML final
    // ------------------------------------------------------------
    const serializer = new XMLSerializer();
    const xmlBody = serializer.serializeToString(doc);
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>\n';

    return (
      xmlDecl +
      xmlBody
        .split(/\r?\n/)
        .filter((line) => !/^\s*$/.test(line))
        .join("\n")
    );
  }

  window.DatasmithSort = { sortAndPurgeUdatasmith };
})();
