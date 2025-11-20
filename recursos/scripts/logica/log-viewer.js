(function () {
  "use strict";

  // ======================================================================
  // LOG VIEWER — VERSIÓN FINAL CON NOTES FOR DUMMIES (COMPLETO)
  // ======================================================================
  // NOTE FOR DUMMIES:
  // Este script:
  // 1) Compara XML ORIGINALES vs PROCESADOS línea por línea.
  // 2) Genera resaltado visual (amarillo = agregado/modificado, rojo = borrado).
  // 3) Evita subrayar labels de Location, Survey Point y Project Base Point.
  // 4) Manda HTML al panel ORIGINAL, UNSORTED y PROCESADO.
  // 5) Devuelve estadísticas para contadores.
  // ======================================================================

  // ======================================================================
  // ESCAPAR HTML
  // ======================================================================
  // NOTE FOR DUMMIES:
  // Evita que los símbolos < > & rompan el HTML. Se convierten a texto.
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // ======================================================================
  // RENDERIZADO SIMPLE (Panel UNSORTED)
  // ======================================================================
  // NOTE FOR DUMMIES:
  // Solo se escapa el XML y se pinta cada línea como texto.
  const renderSimpleXml = (xmlText) => {
    if (!xmlText) return "";
    return String(xmlText)
      .split(/\r?\n/)
      .map((line) => {
        const escaped = escapeHtml(line);
        return escaped.replace(
          /^(\s*&lt;[^&]+&gt;)/,
          '<span style="color: var(--color-azul);">$1</span>'
        );
      })
      .join("\n");
  };

  // ======================================================================
  // UTILIDAD: Contador de líneas idénticas
  // ======================================================================
  const contarLineas = (arr) => {
    const map = {};
    arr.forEach((l) => (map[l] = (map[l] || 0) + 1));
    return map;
  };

  // ======================================================================
  // INTENTAR EXTRAER INFO DE TAGS (ActorMesh, MaterialInstance, etc.)
  // ======================================================================
  const getMeshInfo = (line) => {
    const m = line.match(
      /<(StaticMesh|ActorMesh|Actor|mesh|MaterialInstance|KeyValueProperty)[^>]*\sname="([^"]+)"/
    );
    return m ? { tag: m[1], name: m[2] } : null;
  };

  // ======================================================================
  // AGRUPAR LÍNEAS POR NOMBRE DE ELEMENTO
  // ======================================================================
  const byName = (list) =>
    list.reduce((map, l) => {
      const info = getMeshInfo(l.text);
      if (!info) return map;
      (map[info.name] = map[info.name] || []).push({ ...l, tag: info.tag });
      return map;
    }, {});

  // ======================================================================
  // FUNCIÓN PRINCIPAL DE DIFF
  // ======================================================================
  const buildSideBySideHtml = (origText, procText) => {
    // NOTE FOR DUMMIES:
    // Aquí se divide el texto por líneas para comparar.
    const oLines = String(origText).split(/\r?\n/);
    const nLines = String(procText).split(/\r?\n/);

    const countO = contarLineas(oLines);
    const countN = contarLineas(nLines);

    const common = Object.fromEntries(
      [...new Set([...Object.keys(countO), ...Object.keys(countN)])].map(
        (k) => [k, Math.min(countO[k] || 0, countN[k] || 0)]
      )
    );

    const tagLines = (lines, used, commonMap) =>
      lines.map((l) => {
        used[l] = (used[l] || 0) + 1;
        return used[l] <= commonMap[l] ? "common" : "only";
      });

    const stateO = tagLines(oLines, {}, common);
    const stateN = tagLines(nLines, {}, common);

    const onlyOld = oLines
      .map((text, i) => (stateO[i] === "only" ? { i, text } : null))
      .filter(Boolean);

    const onlyNew = nLines
      .map((text, i) => (stateN[i] === "only" ? { i, text } : null))
      .filter(Boolean);

    const oBy = byName(onlyOld);
    const nBy = byName(onlyNew);

    const modO = {};
    const modN = {};

    const details = [];
    let removedLinesCount = 0;

    // ==================================================================
    // DETECTAR MODIFICADOS / ELIMINADOS
    // ==================================================================
    // ==================================================================
    // DETECTAR MODIFICADOS / ELIMINADOS
    // ==================================================================
    Object.keys(oBy).forEach((name) => {
      const os = oBy[name];
      const ns = nBy[name];
      const tag = os[0].tag;

      if (ns) {
        // ========================
        // EXISTE EN AMBOS → MODIFICADO
        // ========================
        let linesRemovedInItem = 0;
        let labelChange = null;

        for (let i = 0; i < Math.min(os.length, ns.length); i++) {
          const d = diffLineFragments(oLines[os[i].i], nLines[ns[i].i]);
          modO[os[i].i] = d.oldHtml;
          modN[ns[i].i] = d.newHtml;

          if (d.oldHtml.includes("<s>")) {
            linesRemovedInItem++;
          }

          const lo = oLines[os[i].i].match(/label="([^"]*)"/);
          const ln = nLines[ns[i].i].match(/label="([^"]*)"/);
          if (lo && ln && lo[1] !== ln[1]) {
            labelChange = `Label: "${lo[1]}" → "${ln[1]}"`;
          }
        }

        if (linesRemovedInItem > 0) {
          removedLinesCount += linesRemovedInItem;
        }

        if (labelChange) {
          details.push({
            name,
            tag,
            type: "MODIFICADO",
            desc: labelChange,
            line: ns[0].i, // Line in New
            lineOrig: os[0].i // Line in Old
          });
        } else {
          details.push({
            name,
            tag,
            type: "MODIFICADO",
            desc: "Atributos modificados",
            line: ns[0].i,
            lineOrig: os[0].i
          });
        }
      } else {
        // ========================
        // SOLO EN ORIGINAL → ELIMINADO
        // ========================
        details.push({
          name,
          tag,
          type: "ELIMINADO",
          desc: "Elemento eliminado completamente",
          lineOrig: os[0].i // Line in Old
        });
        os.forEach(() => removedLinesCount++);
      }
    });

    // ==================================================================
    // DETECTAR AGREGADOS
    // ==================================================================
    Object.keys(nBy).forEach((name) => {
      if (!oBy[name]) {
        const tag = nBy[name][0].tag;
        details.push({
          name,
          tag,
          type: "AGREGADO",
          desc: "Elemento nuevo",
          line: nBy[name][0].i // Line in New
        });
      }
    });

    // ==================================================================
    // RENDERIZAR CADA PANEL (OLD / NEW)
    // ==================================================================
    const render = (lines, state, mods, tag, isProcessedSide) =>
      lines
        .map((l, i) => {
          const lineText = l || " ";
          const lineId = isProcessedSide ? `proc-${i}` : `orig-${i}`;

          // Color gris para líneas comunes
          if (state[i] === "common") {
            return `<div id="${lineId}" class="linea-log"><span class="cyan">${escapeHtml(lineText)}</span></div>`;
          }

          // Línea modificada → usar HTML generado por diffLineFragments
          if (mods[i]) return `<div id="${lineId}" class="linea-log">${mods[i]}</div>`;

          // En PROCESADO, si es un tag complejo y "only", NO lo marques como agregado
          if (isProcessedSide && state[i] === "only") {
            const tagMatch = lineText.match(
              /^\s*<(StaticMesh|ActorMesh|Actor|MaterialInstance|KeyValueProperty)\b/
            );
            if (tagMatch) {
              return `<div id="${lineId}" class="linea-log"><span class="cyan">${escapeHtml(lineText)}</span></div>`;
            }
            // Added lines use <ins>
            return `<div id="${lineId}" class="linea-log"><ins>${escapeHtml(lineText)}</ins></div>`;
          }

          // old → <s> rojo | new → <mark> amarillo (pero aquí new es solo added o modificado, si es only y no es processed side, es deleted)
          // Wait, tag argument is "s" for old and "mark" for new.
          // But I want <ins> for added (new only) and <mark> for modified (handled by mods[i]).
          // If state[i] is "only" and isProcessedSide is true, it's ADDED. I used <ins> above.
          // If state[i] is "only" and isProcessedSide is false, it's DELETED. I should use <s>.
          
          if (!isProcessedSide && state[i] === "only") {
             return `<div id="${lineId}" class="linea-log"><s>${escapeHtml(lineText)}</s></div>`;
          }

          // Fallback (shouldn't happen often if logic covers all)
          return `<div id="${lineId}" class="linea-log"><${tag}>${escapeHtml(lineText)}</${tag}></div>`;
        })
        .join("\n");

    // ==================================================================
    // CALCULAR METRICAS ESPECIFICAS
    // ==================================================================
    // Purgados: KeyValueProperty eliminados
    // Modificados: StaticMesh modificados
    const purgadosCount = details.filter(
      (d) => d.type === "ELIMINADO" && d.tag === "KeyValueProperty"
    ).length;

    const modificadosCount = details.filter(
      (d) => d.type === "MODIFICADO" && d.tag === "StaticMesh"
    ).length;

    // Si no hay conteo específico, usar el genérico para no mostrar 0 si hubo cambios
    const finalPurgados = purgadosCount > 0 ? purgadosCount : removedLinesCount;
    const finalModificados = modificadosCount > 0 ? modificadosCount : details.filter(d => d.type === "MODIFICADO").length;

    return {
      originalHtml: render(oLines, stateO, modO, "s", false),
      processedHtml: render(nLines, stateN, modN, "mark", true),
      stats: { 
        removedLinesCount: finalPurgados, // Mapeamos a "Purgados"
        modificadosCount: finalModificados,
        details 
      },
    };
  };

  // ======================================================================
  // PROCESADOR DE TAGS XML DETALLADO
  // ======================================================================
  // NOTE FOR DUMMIES:
  // Esta función identifica diferencias dentro del mismo TAG,
  // como atributos cambiados o removidos.
  const diffXmlTagLine = (oldLine, newLine) => {
    // Detectar estructura de XML tipo <ActorMesh ... >
    const tagRe = /^(\s*<[^>\s]+)([^>]*)(>.*)$/;
    const mo = oldLine.match(tagRe);
    const mn = newLine.match(tagRe);
    if (!mo || !mn) return null;

    const [_, h1, attrs1, t1] = mo;
    const [__, h2, attrs2, t2] = mn;

    const tn = h1.match(/<\s*([^\s>]+)/);
    const tagName = tn ? tn[1] : "";

    const meshTag =
      tagName === "StaticMesh" ||
      tagName === "ActorMesh" ||
      tagName === "Actor" ||
      tagName === "MaterialInstance" ||
      tagName === "KeyValueProperty";

    const tagTag = tagName === "tag";

    // Extraer atributos como obj
    const extract = (str) => {
      const obj = {};
      const order = [];
      let m;
      const re = /(\w+)\s*=\s*"([^"]*)"/g;
      while ((m = re.exec(str))) {
        obj[m[1]] = m[2];
        order.push(m[1]);
      }
      return [obj, order];
    };

    const [oldA, oldKeys] = extract(attrs1);
    const [newA, newKeys] = extract(attrs2);

    const layerVal = oldA.layer || newA.layer || "";

    // ==================================================================
    // NO SUBRAYAR LABEL EN: LOCATION DATA, SURVEY POINT, PROJECT BASE POINT
    // ==================================================================
    const noHighlightLabel =
      tagName === "Actor" &&
      (layerVal === "Location Data" ||
        layerVal === "Survey Point" ||
        layerVal === "Project Base Point");

    // ==================================================================
    // CONSTRUIR HTML DE ATRIBUTOS
    // ==================================================================
    const build = (attrs, keys, other, side) => {
      return keys
        .map((k) => {
          const val = attrs[k];
          const exists = Object.prototype.hasOwnProperty.call(other, k);
          const skip = noHighlightLabel && k === "label";

          // 1. Saltar subrayado de label para actores especiales
          if (skip) {
            return ` <span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          }

          // 2. Caso TAG <tag value="...">
          if (tagTag && k === "value") {
            return ` <span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          }

          // 3. SI NO EXISTE EN "other" → agregado/eliminado
          if (!exists) {
            if (meshTag && k !== "label") {
              // MeshTag: NO resaltar atributos excepto label
              return ` <span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            }
            if (meshTag && k === "label") {
              // Aquí sí resaltar label de cambios reales
              return side === "old"
                ? ` <s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`
                : ` <mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
            return side === "old"
              ? ` <s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`
              : ` <mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
          }

          // 4. EXISTE EN AMBOS, PERO CAMBIÓ EL VALOR
          if (val !== other[k]) {
            if (meshTag && k !== "label") {
              return ` <span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            }
            if (meshTag && k === "label") {
              return side === "old"
                ? ` <span class="cyan">${escapeHtml(k)}="</span><s>${escapeHtml(
                    val
                  )}</s><span class="cyan">"</span>`
                : ` <span class="cyan">${escapeHtml(
                    k
                  )}="</span><mark>${escapeHtml(
                    val
                  )}</mark><span class="cyan">"</span>`;
            }
            return side === "old"
              ? ` <span class="cyan">${escapeHtml(k)}="</span><s>${escapeHtml(
                  val
                )}</s><span class="cyan">"</span>`
              : ` <span class="cyan">${escapeHtml(
                  k
                )}="</span><mark>${escapeHtml(
                  val
                )}</mark><span class="cyan">"</span>`;
          }

          // 5. Sin cambios → gris
          return ` <span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        })
        .join("");
    };

    const oldHtml =
      `<span class="cyan">${escapeHtml(h1)}</span>` +
      build(oldA, oldKeys, newA, "old") +
      `<span class="cyan">${escapeHtml(t1)}</span>`;

    const newHtml =
      `<span class="cyan">${escapeHtml(h2)}</span>` +
      build(newA, newKeys, oldA, "new") +
      `<span class="cyan">${escapeHtml(t2)}</span>`;

    return { oldHtml, newHtml };
  };

  // ======================================================================
  // DIFF SIMPLE (para líneas sin XML estructural)
  // ======================================================================
  const diffLineFragments = (a, b) => {
    const xml = diffXmlTagLine(a, b);
    if (xml) return xml;

    let i = 0;
    const n = Math.min(a.length, b.length);
    while (i < n && a[i] === b[i]) i++;

    let j = a.length - 1,
      k = b.length - 1;
    while (j >= i && k >= i && a[j] === b[k]) {
      j--;
      k--;
    }

    const oldHtml =
      escapeHtml(a.slice(0, i)) +
      (j >= i ? `<s>${escapeHtml(a.slice(i, j + 1))}</s>` : "") +
      escapeHtml(a.slice(j + 1));

    const newHtml =
      escapeHtml(b.slice(0, i)) +
      (k >= i ? `<mark>${escapeHtml(b.slice(i, k + 1))}</mark>` : "") +
      escapeHtml(b.slice(k + 1));

    return { oldHtml, newHtml };
  };

  // ======================================================================
  // CONTAR BLOQUES DE TAG
  // ======================================================================
  const countLinesOfTag = (lines, startIndex) => {
    const start = lines[startIndex];
    const m = start.match(/<\s*(\w+)/);
    if (!m) return 1;

    const tag = m[1];
    if (/\/>/.test(start)) return 1;

    let depth = 0;
    let count = 0;
    const open = new RegExp(`<${tag}\\b`);
    const close = new RegExp(`</${tag}>`);

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      count++;
      if (open.test(line)) depth++;
      if (close.test(line)) depth--;
      if (depth === 0) break;
    }

    return count;
  };

  // ======================================================================
  // API PUBLICA: window.LogViewer.render
  // ======================================================================
  window.LogViewer = {
    render: (originalXml, processedXml, unsortedXml) => {
      // Hacer diff
      const diff = buildSideBySideHtml(originalXml, processedXml);

      // Paneles del HTML
      const panelOriginal = document.getElementById("log-original");
      const panelUnsorted = document.getElementById("log-unsorted");
      const panelProcessed = document.getElementById("log-processed");

      if (panelOriginal) panelOriginal.innerHTML = diff.originalHtml;
      if (panelProcessed) panelProcessed.innerHTML = diff.processedHtml;
      if (panelUnsorted) panelUnsorted.innerHTML = renderSimpleXml(unsortedXml);

      return diff.stats;
    },
  };
})();
