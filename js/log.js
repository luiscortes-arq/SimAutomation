(function () {
  "use strict";

  const DEBUG = false;
  const dbg = (...args) => {
    if (DEBUG && typeof console !== "undefined" && console.log) {
      console.log("[Log.js]", ...args);
    }
  };

  let built = false,
    current = "sort",
    views = {},
    tabs = {},
    root;

  const getRoot = () => document.getElementById("log");

  const createEl = (tag, cls, txt) =>
    Object.assign(document.createElement(tag), {
      className: cls || "",
      textContent: txt || "",
    });

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const buildShellIfNeeded = () => {
    if (built) return;

    root = getRoot();
    if (!root) {
      dbg("No se encontró #log en el DOM.");
      return;
    }

    root.className = "log-container";
    root.innerHTML = "";

    const tabInfo = [
      ["sort", "SORT & PURGE"],
      ["merge", "REPLACE & MERGE"],
    ];

    const tabBar = createEl("div", "log-tabs");
    const viewBox = createEl("div", "log-views");

    tabInfo.forEach(([key, label], i) => {
      const tab = createEl(
        "button",
        `log-tab${i === 0 ? " log-tab-active" : ""}`,
        label
      );
      tab.type = "button";
      tab.dataset.type = key;
      tab.onclick = () => switchType(key);

      const view = createEl(
        "div",
        `log-view${i === 0 ? " log-view-active" : ""}`
      );
      view.id = `log-${key}-view`;

      tabs[key] = tab;
      views[key] = view;

      tabBar.appendChild(tab);
      viewBox.appendChild(view);
    });

    root.appendChild(tabBar);
    root.appendChild(viewBox);

    built = true;
  };

  const switchType = (type) => {
    if (!built) return;
    if (!tabs[type] || !views[type]) return;

    current = type;

    Object.keys(tabs).forEach((k) => {
      const active = k === type;
      tabs[k].classList.toggle("log-tab-active", active);
      views[k].classList.toggle("log-view-active", active);
    });
  };

  const line = (msg, kind = "info") => {
    buildShellIfNeeded();
    if (!root) return;

    const div = createEl("div", `log-line-${kind}`, msg);
    root.appendChild(div);
    root.scrollTop = root.scrollHeight;
  };

  const clear = () => {
    buildShellIfNeeded();
    Object.values(views).forEach((v) => (v.innerHTML = ""));
  };

  // ============================================================
  // DIFF
  // ============================================================
  const contarLineas = (arr) => {
    const map = {};
    arr.forEach((l) => (map[l] = (map[l] || 0) + 1));
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

    const [oldAttrs, oldKeys] = extractAttrs(attrs1);
    const [newAttrs, newKeys] = extractAttrs(attrs2);

    const buildAttrsHtml = (selfAttrs, selfKeys, otherAttrs, side) => {
      const pieces = [];

      selfKeys.forEach((k) => {
        const val = selfAttrs[k];
        const existsInOther = Object.prototype.hasOwnProperty.call(
          otherAttrs,
          k
        );
        let seg;

        if (isTagTag && k === "value") {
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

    const oldAttrsHtml = buildAttrsHtml(oldAttrs, oldKeys, newAttrs, "old");
    const newAttrsHtml = buildAttrsHtml(newAttrs, newKeys, oldAttrs, "new");

    const oldHtml =
      `<span class="cyan">${escapeHtml(h1)}</span>` +
      oldAttrsHtml +
      `<span class="cyan">${escapeHtml(t1)}</span>`;

    const newHtml =
      `<span class="cyan">${escapeHtml(h2)}</span>` +
      newAttrsHtml +
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
      lines.map((l) =>
        (used[l] = (used[l] || 0) + 1) <= commonMap[l] ? "common" : "only"
      );

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

          // Fuerza diff por índice si el estado dice "common"
          // pero la línea en el otro lado es distinta.
          if (state[i] === "common") {
            if (!isProcessedSide && nLines[i] !== undefined) {
              const other = nLines[i];
              if (other !== lineText) {
                const { oldHtml } = diffLineFragments(lineText, other);
                return oldHtml;
              }
            }
            if (isProcessedSide && oLines[i] !== undefined) {
              const other = oLines[i];
              if (other !== lineText) {
                const { newHtml } = diffLineFragments(other, lineText);
                return newHtml;
              }
            }
          }

          // <tag value="..."> siempre cyan
          if (/^\s*<tag value="/.test(lineText)) {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // Comunes sin cambios -> cyan
          if (state[i] === "common") {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // Diff fino por pares (StaticMesh / ActorMesh / Actor / mesh / MaterialInstance)
          if (mods[i]) {
            return mods[i];
          }

          // PROCESADO: resaltar solo valor de label=
          if (isProcessedSide) {
            const tagMatch = lineText.match(
              /^\s*<(StaticMesh|ActorMesh|Actor|MaterialInstance)\b/
            );
            if (tagMatch) {
              const m = lineText.match(/^(\s*<[^>]*\slabel=")([^"]*)(".*)$/);
              if (m) {
                const [, pre, val, post] = m;
                return (
                  `<span class="cyan">${escapeHtml(pre)}</span>` +
                  `<mark>${escapeHtml(val)}</mark>` +
                  `<span class="cyan">${escapeHtml(post)}</span>`
                );
              }
            }
          }

          // Resto: línea completa tachada (original) o amarilla (procesado)
          return `<${tag}>${escapeHtml(lineText)}</${tag}>`;
        })
        .join("\n");

    return {
      originalHtml: render(oLines, stateO, modO, "s", false),
      processedHtml: render(nLines, stateN, modN, "mark", true),
    };
  };

  // ============================================================
  // UI
  // ============================================================
  const crearEntradaBase = (titulo) => {
    const entry = createEl("div", "log-entry");
    const header = createEl("div", "log-entry-header", titulo || "Archivo");

    const columns = createEl("div", "log-entry-columns");
    const col1 = createEl("div", "log-column");
    const col2 = createEl("div", "log-column");

    const h1 = createEl("div", "log-column-header", "CÓDIGO ORIGINAL");
    const h2 = createEl("div", "log-column-header", "CÓDIGO PROCESADO");

    const pre1 = createEl("pre", "log-code-block");
    const pre2 = createEl("pre", "log-code-block");

    col1.append(h1, pre1);
    col2.append(h2, pre2);
    columns.append(col1, col2);
    entry.append(header, columns);

    return { entry, pre1, pre2 };
  };

  const showDiff = (type, title, original, processed) => {
    buildShellIfNeeded();
    if (!views[type]) return;

    switchType(type);

    const { entry, pre1, pre2 } = crearEntradaBase(title);
    const diff = buildSideBySideHtml(original, processed);

    pre1.innerHTML = diff.originalHtml;
    pre2.innerHTML = diff.processedHtml;

    views[type].appendChild(entry);
  };

  window.Log = {
    line,
    clear,
    showSortDiff: (fn, o, p) =>
      showDiff("sort", fn || "Archivo sin nombre", o, p),
    showMergeDiff: (label, origName, newName, origXml, mergedXml) =>
      showDiff(
        "merge",
        [label, "ORIGINAL: " + origName, "NUEVO: " + newName]
          .filter(Boolean)
          .join(" · "),
        origXml,
        mergedXml
      ),
  };
})();
