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

  const getMeshKey = (line) => {
    const m = line.match(
      /<(StaticMesh|ActorMesh|Actor|mesh|MaterialInstance)[^>]*\sname="([^"]+)"/
    );
    return m ? m[2] : null;
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
      tagName === "MaterialInstance";

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

    const byName = (list) =>
      list.reduce((map, l) => {
        const name = getMeshKey(l.text);
        if (!name) return map;
        (map[name] = map[name] || []).push(l.i);
        return map;
      }, {});

    const oBy = byName(onlyOld);
    const nBy = byName(onlyNew);

    const modO = {};
    const modN = {};

    Object.keys(oBy).forEach((name) => {
      const os = oBy[name];
      const ns = nBy[name];
      if (!ns) return;
      for (let i = 0; i < Math.min(os.length, ns.length); i++) {
        const d = diffLineFragments(oLines[os[i]], nLines[ns[i]]);
        modO[os[i]] = d.oldHtml;
        modN[ns[i]] = d.newHtml;
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
              /^\s*<(StaticMesh|ActorMesh|Actor|MaterialInstance)\b/
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
    };
  };

  // ============================================================
  // API PÚBLICA (window.LogViewer)
  // ============================================================
  window.LogViewer = {
    render: (originalXml, processedXml) => {
      const diff = buildSideBySideHtml(originalXml, processedXml);
      
      // Inyectar en los contenedores existentes de log.html
      const panels = document.querySelectorAll('.panel-log .contenido-log');
      if (panels.length >= 2) {
        panels[0].innerHTML = `<pre class="log-code-block">${diff.originalHtml}</pre>`;
        panels[1].innerHTML = `<pre class="log-code-block">${diff.processedHtml}</pre>`;
      }
    }
  };
})();
