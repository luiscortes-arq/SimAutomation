// js/sortPurge.js
// Paso 01 – Sort & Purge (.udatasmith)
(function () {
  "use strict";

  const ALLOWED_KV_NAMES = new Set([
    "Label",
    "Actor.Name",
    "Actor.Label",
    "Actor.Path",
    "Actor.Tag",
    "Actor.Layer"
  ]);

  const REMOVE_KVPROP_NAMES = new Set([
    "Element*Category",
    "Element*Family",
    "Element*Type"
  ]);

  const TAG_REMIT_FAMILY_PREFIXES = [
    "Revit.DB.FamilyInstance.Mirrored.",
    "Revit.DB.FamilyInstance.HandFlipped.",
    "Revit.DB.FamilyInstance.FaceFlipped."
  ];

  // Nombres que NO quieres ver en el browser de Twinmotion
  const NOMBRES_A_ELIMINAR = new Set(["LEVEL_HEAD", "LEVEL-HEAD", "LEVEL HEAD"]);

  function labelDescriptivo(nombreCompleto) {
    if (!nombreCompleto) return "";
    const partes = String(nombreCompleto).split("_");
    return partes.length ? partes[partes.length - 1] : "";
  }

  function normalizarNombreSimple(s) {
    if (!s) return "";
    return String(s).trim().toUpperCase();
  }

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

    // 0) Borrar meshes/actors molestos (Level_Head) ANTES de tocar labels
    //    StaticMesh
    Array.from(doc.getElementsByTagName("StaticMesh")).forEach((sm) => {
      const nameNorm = normalizarNombreSimple(sm.getAttribute("name"));
      const labelNorm = normalizarNombreSimple(sm.getAttribute("label"));
      if (
        NOMBRES_A_ELIMINAR.has(nameNorm) ||
        NOMBRES_A_ELIMINAR.has(labelNorm) ||
        nameNorm.startsWith("LEVEL_HEAD") ||
        labelNorm.startsWith("LEVEL_HEAD")
      ) {
        const parent = sm.parentNode;
        if (parent) parent.removeChild(sm);
      }
    });

    //    ActorMesh
    Array.from(doc.getElementsByTagName("ActorMesh")).forEach((am) => {
      const nameNorm = normalizarNombreSimple(am.getAttribute("name"));
      const labelNorm = normalizarNombreSimple(am.getAttribute("label"));
      if (
        NOMBRES_A_ELIMINAR.has(nameNorm) ||
        NOMBRES_A_ELIMINAR.has(labelNorm) ||
        nameNorm.startsWith("LEVEL_HEAD") ||
        labelNorm.startsWith("LEVEL_HEAD")
      ) {
        const parent = am.parentNode;
        if (parent) parent.removeChild(am);
      }
    });

    // 1) Normalizar label en StaticMesh / ActorMesh (solo lo que quedó)
    const staticMeshes = Array.from(doc.getElementsByTagName("StaticMesh"));
    const actorMeshes = Array.from(doc.getElementsByTagName("ActorMesh"));

    staticMeshes.forEach((sm) => {
      const label = sm.getAttribute("label");
      if (label) {
        const base = labelDescriptivo(label);
        if (base) sm.setAttribute("label", base);
      }
    });

    actorMeshes.forEach((am) => {
      const label = am.getAttribute("label");
      if (label) {
        const base = labelDescriptivo(label);
        if (base) am.setAttribute("label", base);
      }
    });

    // 2) Limpiar MetaData
    const metas = Array.from(doc.getElementsByTagName("MetaData"));
    metas.forEach((md) => {
      const children = Array.from(md.childNodes);
      children.forEach((ch) => {
        if (ch.nodeType !== Node.ELEMENT_NODE) return;
        const tagName = ch.tagName;
        if (tagName !== "KeyValue") return;

        const name = ch.getAttribute("name");
        if (!name || !ALLOWED_KV_NAMES.has(name)) {
          md.removeChild(ch);
          return;
        }

        if (name === "Label" || name === "Actor.Label") {
          const val = ch.getAttribute("value");
          if (val) {
            const nuevo = labelDescriptivo(val);
            if (nuevo) ch.setAttribute("value", nuevo);
          }
        }
      });
    });

    // 3) Eliminar tags de Revit FamilyInstance.*
    const allElems = doc.getElementsByTagName("*");
    Array.from(allElems).forEach((elem) => {
      const hijos = Array.from(elem.childNodes);
      hijos.forEach((h) => {
        if (h.nodeType !== Node.ELEMENT_NODE) return;
        if (h.tagName !== "tag") return;
        const val = h.getAttribute("value") || "";
        if (TAG_REMIT_FAMILY_PREFIXES.some((pref) => val.startsWith(pref))) {
          elem.removeChild(h);
        }
      });
    });

    // 4) Eliminar KeyValueProperty con name in REMOVE_KVPROP_NAMES
    const kvProps = Array.from(doc.getElementsByTagName("KeyValueProperty"));
    kvProps.forEach((kvp) => {
      const name = kvp.getAttribute("name") || "";
      if (REMOVE_KVPROP_NAMES.has(name)) {
        const parent = kvp.parentNode;
        if (parent) parent.removeChild(kvp);
      }
    });

    // Serializar
    const serializer = new XMLSerializer();
    const xmlBody = serializer.serializeToString(doc);
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>\n';
    if (/^\s*<\?xml\b/i.test(xmlBody)) {
      return xmlBody;
    }
    return xmlDecl + xmlBody;
  }

  window.DatasmithSort = { sortAndPurgeUdatasmith };
})();