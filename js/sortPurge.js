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
    "Actor.Layer",
  ]);

  const TAG_REMIT_FAMILY_PREFIXES = [
    "Revit.DB.FamilyInstance.Mirrored.",
    "Revit.DB.FamilyInstance.HandFlipped.",
    "Revit.DB.FamilyInstance.FaceFlipped.",
  ];

  const NOMBRES_A_ELIMINAR = new Set([
    "LEVEL_HEAD",
    "LEVEL-HEAD",
    "LEVEL HEAD",
  ]);

  // Quita rutas tipo carpeta/proyecto, pero NO toca los "_"
  const getRootPart = (s) => {
    if (!s) return "";
    const trimmed = String(s).trim();
    const parts = trimmed.split(/[\\/|]+/); // separadores de ruta
    return parts[parts.length - 1] || "";
  };

  // Para StaticMesh / Actor (name/label): queremos CO_01, etc.
  // Ej.: Structural_Columns_UC-Universal_Column-Column_CO_01 -> CO_01
  const getMeshSuffix = (s) => {
    if (!s) return "";
    const base = getRootPart(s); // quitamos rutas si las hay
    const parts = base.split("_");

    if (parts.length >= 2) {
      const last = parts[parts.length - 1].trim();
      const prev = parts[parts.length - 2].trim();
      // Si el último fragmento es numérico, usamos prev + "_" + last
      if (/^\d+$/.test(last) && prev) {
        return `${prev}_${last}`;
      }
    }

    // Fallback: último fragmento no vacío o base completa
    const nonEmpty = parts.filter((p) => p.trim());
    const lastNonEmpty = nonEmpty[nonEmpty.length - 1];
    return (lastNonEmpty || base).trim();
  };

  const normalizarNombreSimple = (s) =>
    s ? String(s).trim().toUpperCase() : "";

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

    // 0) Eliminar elementos no deseados como LEVEL_HEAD en StaticMesh y ActorMesh
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
          const p = el.parentNode;
          if (p) p.removeChild(el);
        }
      });
    };

    eliminarPorNombre("StaticMesh");
    eliminarPorNombre("ActorMesh");

    // 1) Normalizar LABEL de StaticMesh (queremos CO_01, etc.)
    byTag("StaticMesh").forEach((el) => {
      const lbl = el.getAttribute("label");
      if (lbl) {
        const finalLabel = getMeshSuffix(lbl);
        if (finalLabel) el.setAttribute("label", finalLabel);
      }
    });

    // 1b) Normalizar NAME y LABEL de cualquier nodo "Actor*" (ActorMesh, Actor, StaticMeshActor, etc.)
    Array.from(doc.getElementsByTagName("*")).forEach((el) => {
      if (!/Actor/i.test(el.tagName)) return;

      const nm = el.getAttribute("name");
      if (nm) {
        const baseName = getMeshSuffix(nm);
        if (baseName) el.setAttribute("name", baseName);
      }

      const lbl = el.getAttribute("label");
      if (lbl) {
        const baseLabel = getMeshSuffix(lbl);
        if (baseLabel) el.setAttribute("label", baseLabel);
      }
    });

    // 2) Limpiar MetaData y sus hijos <KeyValue> según reglas
    byTag("MetaData").forEach((md) => {
      Array.from(md.children).forEach((ch) => {
        if (ch.tagName !== "KeyValue") return;

        const name = ch.getAttribute("name");
        if (!name || !ALLOWED_KV_NAMES.has(name)) {
          md.removeChild(ch);
          return;
        }

        // Normalizamos valores de Label / Actor.Label / Actor.Name (limpia rutas, NO corta "_" interno)
        if (
          name === "Label" ||
          name === "Actor.Label" ||
          name === "Actor.Name"
        ) {
          const val = ch.getAttribute("value");
          if (val) {
            const nuevo = getRootPart(val);
            if (nuevo) ch.setAttribute("value", nuevo);
          }
        }
      });
    });

    // 3) Eliminar <tag> hijos de cualquier nodo que tengan prefijo Revit Family
    Array.from(doc.getElementsByTagName("*")).forEach((elem) => {
      Array.from(elem.children).forEach((h) => {
        if (h.tagName !== "tag") return;
        const val = h.getAttribute("value") || "";
        if (TAG_REMIT_FAMILY_PREFIXES.some((pref) => val.startsWith(pref))) {
          elem.removeChild(h);
        }
      });
    });

    // 4) Eliminar <KeyValueProperty> con nombres no deseados:
    //    - Element*
    //    - Type*
    byTag("KeyValueProperty").forEach((kvp) => {
      const name = (kvp.getAttribute("name") || "").trim();
      if (name.startsWith("Element*") || name.startsWith("Type*")) {
        const p = kvp.parentNode;
        if (p) p.removeChild(kvp);
      }
    });

    // Serializar de vuelta a XML string
    const serializer = new XMLSerializer();
    const xmlBody = serializer.serializeToString(doc);
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>\n';
    let finalXml = /^\s*<\?xml\b/i.test(xmlBody) ? xmlBody : xmlDecl + xmlBody;

    // Quitar líneas completamente en blanco (solo espacios/tabs), sin modificar sintaxis
    finalXml = finalXml
      .split(/\r?\n/)
      .filter((line) => !/^\s*$/.test(line))
      .join("\n");

    return finalXml;
  }

  window.DatasmithSort = { sortAndPurgeUdatasmith };
})();
