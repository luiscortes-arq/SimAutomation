// js/sortPurge.js
// Paso 01 – Sort & Purge (.udatasmith)
(function () {
  "use strict"; // Activa modo estricto para mayor seguridad

  // Lista de atributos permitidos que deben conservarse en <KeyValue>
  const ALLOWED_KV_NAMES = new Set([
    "Label",
    "Actor.Name",
    "Actor.Label",
    "Actor.Path",
    "Actor.Tag",
    "Actor.Layer",
  ]);

  // Atributos en <KeyValueProperty> que deben eliminarse del XML
  const REMOVE_KVPROP_NAMES = new Set([
    "Element*Category",
    "Element*Family",
    "Element*Type",
  ]);

  // Prefijos de tags de Revit FamilyInstance a eliminar
  const TAG_REMIT_FAMILY_PREFIXES = [
    "Revit.DB.FamilyInstance.Mirrored.",
    "Revit.DB.FamilyInstance.HandFlipped.",
    "Revit.DB.FamilyInstance.FaceFlipped.",
  ];

  // Nombres de elementos estáticos o actores que deben eliminarse
  const NOMBRES_A_ELIMINAR = new Set([
    "LEVEL_HEAD",
    "LEVEL-HEAD",
    "LEVEL HEAD",
  ]);

  // Extrae la última parte del nombre como label descriptivo
  function labelDescriptivo(nombreCompleto) {
    if (!nombreCompleto) return "";
    const partes = String(nombreCompleto).split("_");
    return partes.length ? partes[partes.length - 1] : "";
  }

  // Convierte nombre a mayúsculas y sin espacios
  function normalizarNombreSimple(s) {
    if (!s) return "";
    return String(s).trim().toUpperCase();
  }

  // Función principal: recibe XML como texto y devuelve nuevo XML purgado y ordenado
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

    // 0) Eliminar elementos no deseados como LEVEL_HEAD en StaticMesh y ActorMesh
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

    // 1) Simplificar labels en StaticMesh y ActorMesh
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

    // 2) Limpiar MetaData y sus hijos <KeyValue> según reglas
    const metas = Array.from(doc.getElementsByTagName("MetaData"));
    metas.forEach((md) => {
      const children = Array.from(md.childNodes);
      children.forEach((ch) => {
        if (ch.nodeType !== Node.ELEMENT_NODE) return;
        const tagName = ch.tagName;
        if (tagName !== "KeyValue") return;

        const name = ch.getAttribute("name");
        if (!name || !ALLOWED_KV_NAMES.has(name)) {
          md.removeChild(ch); // Elimina el nodo si no está permitido
          return;
        }

        // Si es Label o Actor.Label, simplifica el value
        if (name === "Label" || name === "Actor.Label") {
          const val = ch.getAttribute("value");
          if (val) {
            const nuevo = labelDescriptivo(val);
            if (nuevo) ch.setAttribute("value", nuevo);
          }
        }
      });
    });

    // 3) Eliminar <tag> hijos de cualquier nodo que tengan prefijo Revit Family
    const allElems = doc.getElementsByTagName("*");
    Array.from(allElems).forEach((elem) => {
      const hijos = Array.from(elem.childNodes);
      hijos.forEach((h) => {
        if (h.nodeType !== Node.ELEMENT_NODE) return;
        if (h.tagName !== "tag") return;
        const val = h.getAttribute("value") || "";
        if (TAG_REMIT_FAMILY_PREFIXES.some((pref) => val.startsWith(pref))) {
          elem.removeChild(h); // Elimina tag con prefijo sospechoso
        }
      });
    });

    // 4) Eliminar <KeyValueProperty> con nombres de Revit no deseados
    const kvProps = Array.from(doc.getElementsByTagName("KeyValueProperty"));
    kvProps.forEach((kvp) => {
      const name = kvp.getAttribute("name") || "";
      if (REMOVE_KVPROP_NAMES.has(name)) {
        const parent = kvp.parentNode;
        if (parent) parent.removeChild(kvp);
      }
    });

    // Serializar de vuelta a XML string
    const serializer = new XMLSerializer();
    const xmlBody = serializer.serializeToString(doc);
    const xmlDecl = '<?xml version="1.0" encoding="utf-8"?>\n';
    if (/^\s*<\?xml\b/i.test(xmlBody)) {
      return xmlBody; // Ya contiene encabezado XML
    }
    return xmlDecl + xmlBody;
  }

  // Expone función principal en window
  window.DatasmithSort = { sortAndPurgeUdatasmith };
})();
