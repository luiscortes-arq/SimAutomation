(function () {
  "use strict";

  // ============================================
  // LOG VIEWER ADAPTADO
  // ============================================

  // Escapa caracteres especiales para mostrarlos como texto en HTML.
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // Helper para renderizar XML simple con resaltado básico
  const renderSimpleXml = (xmlText) => {
    if (!xmlText) return '';
    return String(xmlText).split(/\r?\n/).map(line => {
        const escaped = escapeHtml(line);
        // Resaltar tags
        if (/^\s*&lt;/.test(escaped)) {
            return escaped.replace(/^(\s*&lt;[^&]+&gt;)/, '<span style="color: var(--color-azul);">$1</span>');
        }
        return escaped;
    }).join('\n');
  };

  // ============================================================
  // LÓGICA DE DIFF (COMPARAR ORIGINAL VS PROCESADO)
  // ============================================================

  const contarLineas = (arr) => {
    const map = {};
    arr.forEach((l) => {
      map[l] = (map[l] || 0) + 1;
    });
    return map;
  };

  const getMeshInfo = (line) => {
    const m = line.match(
      /<(StaticMesh|ActorMesh|Actor|mesh|MaterialInstance|KeyValueProperty)[^>]*\sname="([^"]+)"/
    );
    return m ? { tag: m[1], name: m[2] } : null;
  };

  const byName = (list) =>
    list.reduce((map, l) => {
      const info = getMeshInfo(l.text);
      if (!info) return map;
      (map[info.name] = map[info.name] || []).push({ ...l, tag: info.tag });
      return map;
    }, {});

  const buildSideBySideHtml = (origText, procText) => {
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

    // Identificar Modificados (existen en ambos) y Eliminados (solo en old)
    Object.keys(oBy).forEach((name) => {
      const os = oBy[name];
      const ns = nBy[name];
      const tag = os[0].tag; // Tomamos el tag del primer elemento

      if (ns) {
        // Existe en ambos -> MODIFICADO
        let linesRemovedInItem = 0;
        let labelChange = null;

        for (let i = 0; i < Math.min(os.length, ns.length); i++) {
          const d = diffLineFragments(oLines[os[i].i], nLines[ns[i].i]);
          modO[os[i].i] = d.oldHtml;
          modN[ns[i].i] = d.newHtml;

          // Detectar cambios específicos
          if (d.oldHtml.includes("<s>")) {
            linesRemovedInItem++;
          }

          // Detectar cambio de Label
          const labelMatchOld = oLines[os[i].i].match(/label="([^"]*)"/);
          const labelMatchNew = nLines[ns[i].i].match(/label="([^"]*)"/);

          if (labelMatchOld && labelMatchNew && labelMatchOld[1] !== labelMatchNew[1]) {
            labelChange = `Label: "${labelMatchOld[1]}" -> "${labelMatchNew[1]}"`;
          }
        }

        // Solo sumamos al contador, ya NO agregamos detalle de PARCIALMENTE_ELIMINADO
        if (linesRemovedInItem > 0) {
          removedLinesCount += linesRemovedInItem;
        }

        if (labelChange) {
          details.push({
            name: name,
            tag: tag,
            type: "MODIFICADO",
            desc: labelChange,
          });
        } else if (
          linesRemovedInItem > 0 ||
          ns.some((n) => nLines[n.i].includes("<mark>"))
        ) {
          // Si hubo líneas eliminadas o atributos marcados, lo contamos como MODIFICADO
          details.push({
            name: name,
            tag: tag,
            type: "MODIFICADO",
            desc: "Atributos modificados",
          });
        }
      } else {
        // Solo en old -> ELIMINADO COMPLETAMENTE
        details.push({
          name: name,
          tag: tag,
          type: "ELIMINADO",
          desc: "Elemento eliminado completamente",
        });
        // Contar líneas eliminadas
        os.forEach((obj) => {
          // Count lines based on the text content of the item
          // If the item spans multiple lines in the original file, we should count them.
          // However, 'os' here is a list of objects {i, text, tag}. 
          // If 'byName' grouped them correctly, 'os' contains all lines belonging to this item.
          // So we just need to count the length of 'os'.
          // BUT, 'byName' only groups by the *definition* line. 
          // We need to count the full block.
          removedLinesCount += 1;
        });
      }
    });

    // Identificar Agregados (solo en new)
    Object.keys(nBy).forEach((name) => {
      if (!oBy[name]) {
        const tag = nBy[name][0].tag;
        details.push({
          name: name,
          tag: tag,
          type: "AGREGADO",
          desc: "Elemento nuevo",
        });
      }
    });

    const render = (lines, state, mods, tag, isProcessedSide) =>
      lines
        .map((l, i) => {
          const lineText = l || " ";
          if (/^\s*<tag value="/.test(lineText)) {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }
          if (state[i] === "common") {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }
          if (mods[i]) {
            return mods[i];
          }
          if (isProcessedSide && state[i] === "only") {
            const tagMatch = lineText.match(
              /^\s*<(StaticMesh|ActorMesh|Actor|MaterialInstance|KeyValueProperty)\b/
            );
            if (tagMatch) {
              return `<span class="cyan">${escapeHtml(lineText)}</span>`;
            }
          }
          return `<${tag}>${escapeHtml(lineText)}</${tag}>`;
        })
        .join("\n");

    return {
      originalHtml: render(oLines, stateO, modO, "s", false),
      processedHtml: render(nLines, stateN, modN, "mark", true),
      stats: { removedLinesCount, details },
    };
  };

  const diffXmlTagLine = (oldLine, newLine) => {
    const tagRe = /^(\s*<[^>\s]+)([^>]*)(>.*)$/;
    const mo = oldLine.match(tagRe);
    const mn = newLine.match(tagRe);
    if (!mo || !mn) return null;

    const [_, h1, attrs1, t1] = mo;
    const [__, h2, attrs2, t2] = mn;

    const tnMatch = h1.match(/<\s*([^\s>]+)/);
    const tagName = tnMatch ? tnMatch[1] : "";

    const isMeshTag =
      tagName === "StaticMesh" ||
      tagName === "ActorMesh" ||
      tagName === "Actor" ||
      tagName === "MaterialInstance" ||
      tagName === "KeyValueProperty";

    const isTagTag = tagName === "tag";

    const extractAttrs = (str) => {
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

    const [oldAttrsObj, oldKeys] = extractAttrs(attrs1);
    const [newAttrsObj, newKeys] = extractAttrs(attrs2);

    const layerVal = oldAttrsObj.layer || newAttrsObj.layer || "";

    const skipLabelHighlight =
      tagName === "Actor" &&
      (layerVal === "Location Data" ||
        layerVal === "Survey Point" ||
        layerVal === "Project Base Point");

    const buildAttrsHtml = (selfAttrs, selfKeys, otherAttrs, side) => {
      const pieces = [];

      selfKeys.forEach((k) => {
        const val = selfAttrs[k];
        const existsInOther = Object.prototype.hasOwnProperty.call(
          otherAttrs,
          k
        );
        let seg;

        const skipThisLabel = skipLabelHighlight && k === "label";

        if (skipThisLabel) {
          seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        } else if (isTagTag && k === "value") {
          seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        } else if (!existsInOther) {
          if (isMeshTag && k !== "label") {
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else if (isMeshTag && k === "label") {
            if (side === "old") {
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          } else {
            if (side === "old") {
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          }
        } else {
          const otherVal = otherAttrs[k];
          if (val === otherVal) {
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else {
            if (isMeshTag && k !== "label") {
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else if (isMeshTag && k === "label") {
              if (side === "old") {
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<s>${escapeHtml(val)}</s>` +
                  `<span class="cyan">"</span>`;
              } else {
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<mark>${escapeHtml(val)}</mark>` +
                  `<span class="cyan">"</span>`;
              }
            } else if (isTagTag && k === "value") {
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else {
              if (side === "old") {
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<s>${escapeHtml(val)}</s>` +
                  `<span class="cyan">"</span>`;
              } else {
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<mark>${escapeHtml(val)}</mark>` +
                  `<span class="cyan">"</span>`;
              }
            }
          }
        }
        pieces.push(" " + seg);
      });

      return pieces.join("");
    };

    const oldHtml =
      `<span class="cyan">${escapeHtml(h1)}</span>` +
      buildAttrsHtml(oldAttrsObj, oldKeys, newAttrsObj, "old") +
      `<span class="cyan">${escapeHtml(t1)}</span>`;

    const newHtml =
      `<span class="cyan">${escapeHtml(h2)}</span>` +
      buildAttrsHtml(newAttrsObj, newKeys, oldAttrsObj, "new") +
      `<span class="cyan">${escapeHtml(t2)}</span>`;

    return { oldHtml, newHtml };
  };

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

  const countLinesOfTag = (lines, startIndex) => {
    const startLine = lines[startIndex];
    const tagMatch = startLine.match(/<\s*(\w+)/);
    if (!tagMatch) return 1;

    const tagName = tagMatch[1];
    // Si es autocerrada
    if (/\/>/.test(startLine)) return 1;

    let depth = 0;
    let count = 0;
    const startRe = new RegExp(`<${tagName}\\b`);
    const endRe = new RegExp(`</${tagName}>`);

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      count++;
      if (startRe.test(line)) depth++;
      if (endRe.test(line)) depth--;

      if (depth === 0) break;
    }
    return count;
  };

  // ============================================================
  // API PÚBLICA (window.LogViewer)
  // ============================================================
  window.LogViewer = {
    render: (originalXml, processedXml, unsortedXml) => {
        const diff = buildSideBySideHtml(originalXml, processedXml);

        // Inyectar en los contenedores existentes de log.html
        const panelOriginal = document.getElementById('log-original');
        const panelUnsorted = document.getElementById('log-unsorted');
        const panelProcessed = document.getElementById('log-processed');

        if (panelOriginal) panelOriginal.innerHTML = diff.originalHtml;
        if (panelProcessed) panelProcessed.innerHTML = diff.processedHtml;
        
        // Renderizar el panel del medio (Unsorted)
        if (panelUnsorted) {
            panelUnsorted.innerHTML = renderSimpleXml(unsortedXml);
        }

        return diff.stats;
    },
  };
})();