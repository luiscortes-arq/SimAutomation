(function () {
  "use strict";

  // ============================================
  // DEBUG
  // - Cambia DEBUG a true si quieres ver logs en consola.
  // - dbg() es solo un helper para no tener que escribir console.log en todos lados.
  // ============================================
  const DEBUG = false;
  const dbg = (...args) => {
    if (DEBUG && typeof console !== "undefined" && console.log) {
      console.log("[Log.js]", ...args);
    }
  };

  // ============================================
  // ESTADO INTERNO DEL MÓDULO
  // - built: indica si ya se construyó la interfaz del log.
  // - current: pestaña actual ("sort" o "merge").
  // - views: referencia a los contenedores de cada pestaña.
  // - tabs: referencia a los botones de cada pestaña.
  // - root: div principal con id="log" donde se monta todo.
  // ============================================
  let built = false,
    current = "sort",
    views = {},
    tabs = {},
    root;

  // Obtiene el contenedor raíz (#log) del DOM.
  const getRoot = () => document.getElementById("log");

  // Helper para crear elementos DOM rápido y limpio.
  // tag: tipo de etiqueta ("div", "button", etc)
  // cls: nombre de clase CSS
  // txt: texto a mostrar dentro del elemento
  const createEl = (tag, cls, txt) =>
    Object.assign(document.createElement(tag), {
      className: cls || "",
      textContent: txt || "",
    });

  // Escapa caracteres especiales para mostrarlos como texto en HTML.
  // Muy importante para que el XML no se interprete como etiquetas reales.
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // ============================================
  // CONSTRUCCIÓN DE LA INTERFAZ (TABS + VISTAS)
  // ============================================
  const buildShellIfNeeded = () => {
    // Si ya está construido, no volvemos a crearlo.
    if (built) return;

    root = getRoot();
    // Si no existe el div#log, no hacemos nada.
    if (!root) return;

    // Asignamos clase base del contenedor y limpiamos contenido previo.
    root.className = "log-container";
    root.innerHTML = "";

    // Definimos las pestañas del log:
    // - "sort": para SORT & PURGE
    // - "merge": para REPLACE & MERGE
    const tabInfo = [
      ["sort", "SORT & PURGE"],
      ["merge", "REPLACE & MERGE"],
    ];

    const tabBar = createEl("div", "log-tabs");
    const viewBox = createEl("div", "log-views");

    // Creamos botón de tab y vista asociada para cada tipo.
    tabInfo.forEach(([key, label], i) => {
      // Botón de la pestaña (tab)
      const tab = createEl(
        "button",
        `log-tab${i === 0 ? " log-tab-active" : ""}`,
        label
      );
      tab.type = "button";
      tab.dataset.type = key;
      tab.onclick = () => switchType(key);

      // Contenedor de la vista (donde se insertan entradas del log)
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

  // Cambia de pestaña (entre SORT & PURGE y REPLACE & MERGE).
  const switchType = (type) => {
    if (!built) return;
    if (!tabs[type] || !views[type]) return;

    current = type;

    // Activamos visualmente solo la pestaña y vista seleccionadas.
    Object.keys(tabs).forEach((k) => {
      const active = k === type;
      tabs[k].classList.toggle("log-tab-active", active);
      views[k].classList.toggle("log-view-active", active);
    });
  };

  // Agrega una línea simple al log (no al diff side-by-side, sino al contenedor raíz).
  // kind puede ser "info", "error", etc. y se usa en la clase CSS.
  const line = (msg, kind = "info") => {
    buildShellIfNeeded();
    if (!root) return;

    const div = createEl("div", `log-line-${kind}`, msg);
    root.appendChild(div);
    // Siempre hace scroll al final para ver el último mensaje.
    root.scrollTop = root.scrollHeight;
  };

  // Limpia las vistas de SORT y MERGE (pero no destruye la UI).
  const clear = () => {
    buildShellIfNeeded();
    Object.values(views).forEach((v) => {
      v.innerHTML = "";
    });
  };

  // ============================================================
  // LÓGICA DE DIFF (COMPARAR ORIGINAL VS PROCESADO)
  // ============================================================

  // Cuenta cuántas veces aparece cada línea.
  // Devuelve un objeto: { "textoDeLinea": contador, ... }
  const contarLineas = (arr) => {
    const map = {};
    arr.forEach((l) => {
      map[l] = (map[l] || 0) + 1;
    });
    return map;
  };

  // Extrae el valor de name="..." de ciertas etiquetas XML (StaticMesh, ActorMesh, Actor, mesh, MaterialInstance).
  // Esto sirve para emparejar lineas del original vs procesado que pertenecen al mismo "objeto".
  const getMeshKey = (line) => {
    const m = line.match(
      /<(StaticMesh|ActorMesh|Actor|mesh|MaterialInstance)[^>]*\sname="([^"]+)"/
    );
    return m ? m[2] : null;
  };

  // Hace diff inteligente de líneas que son ETIQUETAS XML.
  // Separa nombre de etiqueta, atributos y cierre, y resalta cambios a nivel atributo.
  const diffXmlTagLine = (oldLine, newLine) => {
    const tagRe = /^(\s*<[^>\s]+)([^>]*)(>.*)$/;
    const mo = oldLine.match(tagRe);
    const mn = newLine.match(tagRe);
    // Si alguna no calza con el patrón XML simple, abortamos y se usa diff normal de texto.
    if (!mo || !mn) return null;

    const [_, h1, attrs1, t1] = mo;
    const [__, h2, attrs2, t2] = mn;

    // Sacamos el nombre de la etiqueta (StaticMesh, ActorMesh, Actor, etc.)
    const tnMatch = h1.match(/<\s*([^\s>]+)/);
    const tagName = tnMatch ? tnMatch[1] : "";

    // isMeshTag: etiquetas "grandes" donde nos interesa mucho el label.
    const isMeshTag =
      tagName === "StaticMesh" ||
      tagName === "ActorMesh" ||
      tagName === "Actor" ||
      tagName === "MaterialInstance";

    // isTagTag: etiqueta <tag value="..."> (estos se pintan siempre cyan, sin highlight).
    const isTagTag = tagName === "tag";

    // Convierte atributos (dentro del tag) a objeto { attr: valor } y array de claves en orden.
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

    // layerVal: valor de layer en cualquiera de las dos líneas (old o new).
    const layerVal = oldAttrsObj.layer || newAttrsObj.layer || "";

    // REGLA ESPECIAL:
    // Para Actors con layer:
    //   - "Location Data"
    //   - "Survey Point"
    //   - "Project Base Point"
    // NO QUEREMOS resaltar el label (siempre lo dejamos cyan).
    const skipLabelHighlight =
      tagName === "Actor" &&
      (layerVal === "Location Data" ||
        layerVal === "Survey Point" ||
        layerVal === "Project Base Point");

    // Construye el HTML de los atributos con formateo según si:
    // - se mantiene igual (cyan)
    // - se agrega (mark o cyan)
    // - se elimina (s)
    // side: "old" o "new" para saber si pintamos tachado o resaltado.
    const buildAttrsHtml = (selfAttrs, selfKeys, otherAttrs, side) => {
      const pieces = [];

      selfKeys.forEach((k) => {
        const val = selfAttrs[k];
        const existsInOther = Object.prototype.hasOwnProperty.call(
          otherAttrs,
          k
        );
        let seg;

        // Si es uno de los ACTOR especiales, nunca resaltamos el label (solo cyan).
        const skipThisLabel = skipLabelHighlight && k === "label";

        if (skipThisLabel) {
          // Actor con layer especial => label SIEMPRE cyan sin highlight.
          seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        } else if (isTagTag && k === "value") {
          // Para <tag value="..."> siempre cyan, sin tachado ni highlight.
          seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        } else if (!existsInOther) {
          // Atributo existe solo en un lado (se añadió o se borró)
          if (isMeshTag && k !== "label") {
            // Para mesh tags, cualquier atributo distinto de label se queda cyan.
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else if (isMeshTag && k === "label") {
            // label en mesh tags:
            // - old => tachado
            // - new => amarillo
            if (side === "old") {
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          } else {
            // Otros tags cualquiera:
            // - old => tachado
            // - new => amarillo
            if (side === "old") {
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          }
        } else {
          // Atributo existe en ambos lados (old y new)
          const otherVal = otherAttrs[k];
          if (val === otherVal) {
            // Si el valor no cambió => cyan.
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else {
            // El valor SÍ cambió.
            if (isMeshTag && k !== "label") {
              // Para mesh tags, atributos que no son label se quedan cyan aunque cambien.
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else if (isMeshTag && k === "label") {
              // label de mesh tag:
              //   old => valor tachado, pero k=" y " en cyan
              //   new => valor destacado, pero k=" y " en cyan
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
              // Para <tag value="..."> siempre cyan aunque cambie (caso especial).
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else {
              // Cambio genérico de atributo:
              //   old => valor tachado
              //   new => valor con highlight
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

        // Anteponemos un espacio porque así van separados los atributos.
        pieces.push(" " + seg);
      });

      return pieces.join("");
    };

    // Reconstruimos línea OLD con highlight/tachados por atributo.
    const oldHtml =
      `<span class="cyan">${escapeHtml(h1)}</span>` +
      buildAttrsHtml(oldAttrsObj, oldKeys, newAttrsObj, "old") +
      `<span class="cyan">${escapeHtml(t1)}</span>`;

    // Reconstruimos línea NEW con highlight/tachados por atributo.
    const newHtml =
      `<span class="cyan">${escapeHtml(h2)}</span>` +
      buildAttrsHtml(newAttrsObj, newKeys, oldAttrsObj, "new") +
      `<span class="cyan">${escapeHtml(t2)}</span>`;

    return { oldHtml, newHtml };
  };

  // Diff para líneas que NO son etiquetas XML "bonitas".
  // Hace un diff por caracteres (inicio igual, fin igual, y centro cambiado).
  const diffLineFragments = (a, b) => {
    // Primero intentamos parsear como línea XML:
    const xml = diffXmlTagLine(a, b);
    if (xml) return xml;

    // Si no es XML, hacemos diff de texto sencillo.
    let i = 0;
    const n = Math.min(a.length, b.length);

    // Avanzamos desde el inicio hasta que las letras dejan de coincidir.
    while (i < n && a[i] === b[i]) i++;

    // Ahora caminamos desde el final hacia atrás mientras coincidan.
    let j = a.length - 1,
      k = b.length - 1;
    while (j >= i && k >= i && a[j] === b[k]) {
      j--;
      k--;
    }

    // oldHtml: parte igual + parte tachada + parte final igual.
    const oldHtml =
      escapeHtml(a.slice(0, i)) +
      (j >= i ? `<s>${escapeHtml(a.slice(i, j + 1))}</s>` : "") +
      escapeHtml(a.slice(j + 1));

    // newHtml: parte igual + parte marcadita + parte final igual.
    const newHtml =
      escapeHtml(b.slice(0, i)) +
      (k >= i ? `<mark>${escapeHtml(b.slice(i, k + 1))}</mark>` : "") +
      escapeHtml(b.slice(k + 1));

    return { oldHtml, newHtml };
  };

  // Construye el HTML side-by-side (original vs procesado).
  // - Resalta solo lo que se borra (tachado) y lo nuevo (amarillo).
  // - Lo que se mantiene igual se pinta cyan.
  const buildSideBySideHtml = (origText, procText) => {
    // Convertimos el texto completo en arreglos de líneas.
    const oLines = String(origText).split(/\r?\n/);
    const nLines = String(procText).split(/\r?\n/);

    // Contamos cuántas veces aparece cada línea.
    const countO = contarLineas(oLines);
    const countN = contarLineas(nLines);

    // Calculamos cuántas veces se considera una línea "común" en ambos lados.
    const common = Object.fromEntries(
      [...new Set([...Object.keys(countO), ...Object.keys(countN)])].map(
        (k) => [k, Math.min(countO[k] || 0, countN[k] || 0)]
      )
    );

    // Marca líneas como:
    // - "common" si están en ambos textos la misma cantidad de veces
    // - "only" si aparecen de más en uno de los lados.
    const tagLines = (lines, used, commonMap) =>
      lines.map((l) => {
        used[l] = (used[l] || 0) + 1;
        return used[l] <= commonMap[l] ? "common" : "only";
      });

    const stateO = tagLines(oLines, {}, common);
    const stateN = tagLines(nLines, {}, common);

    // Extraemos las líneas que solo aparecen en OLD.
    const onlyOld = oLines
      .map((text, i) => (stateO[i] === "only" ? { i, text } : null))
      .filter(Boolean);

    // Extraemos las líneas que solo aparecen en NEW.
    const onlyNew = nLines
      .map((text, i) => (stateN[i] === "only" ? { i, text } : null))
      .filter(Boolean);

    // Agrupa líneas por "name" (key sacada de name="...") para emparejarlas.
    const byName = (list) =>
      list.reduce((map, l) => {
        const name = getMeshKey(l.text);
        if (!name) return map;
        (map[name] = map[name] || []).push(l.i);
        return map;
      }, {});

    const oBy = byName(onlyOld);
    const nBy = byName(onlyNew);

    // Aquí guardamos el HTML de líneas modificadas.
    const modO = {};
    const modN = {};

    // Emparejamos líneas old/new que comparten el mismo name="..."
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

    // RENDER: decide cómo pintar cada línea según:
    // - si es común
    // - si es solo old/new
    // - si es modificada
    // - si es etiqueta <tag value="...">
    const render = (lines, state, mods, tag, isProcessedSide) =>
      lines
        .map((l, i) => {
          const lineText = l || " ";

          // 1) Líneas de <tag value="..."> siempre cyan (no se subrayan).
          if (/^\s*<tag value="/.test(lineText)) {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // 2) Líneas comunes en ambos lados => cyan.
          if (state[i] === "common") {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // 3) Si la línea fue detectada como modificada, usamos el HTML diffeado.
          if (mods[i]) {
            return mods[i];
          }

          // 4) Para el lado procesado (derecha), si la línea solo existe ahí
          //    y es una de las etiquetas principales, la mostramos cyan (se considera "nueva normal").
          if (isProcessedSide && state[i] === "only") {
            const tagMatch = lineText.match(
              /^\s*<(StaticMesh|ActorMesh|Actor|MaterialInstance)\b/
            );
            if (tagMatch) {
              // No se resalta en amarillo, se queda cyan porque es parte del resultado final.
              return `<span class="cyan">${escapeHtml(lineText)}</span>`;
            }
          }

          // 5) Todo lo demás:
          //    - Lado original: se pinta con <s> (tachado) si es "solo old".
          //    - Lado procesado: se pinta con <mark> si es "solo new" y no entra en las reglas anteriores.
          return `<${tag}>${escapeHtml(lineText)}</${tag}>`;
        })
        .join("\n");

    // HTML final para cada columna.
    return {
      originalHtml: render(oLines, stateO, modO, "s", false),
      processedHtml: render(nLines, stateN, modN, "mark", true),
    };
  };

  // ============================================================
  // UI PARA ENTRADAS DE LOG (SIDE-BY-SIDE)
  // ============================================================

  // Crea la estructura HTML de una entrada:
  // [Título]
  // [Columna IZQ: Código Original]   [Columna DER: Código Procesado]
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

    // Devolvemos referencias a los <pre> para poder inyectar el HTML del diff.
    return { entry, pre1, pre2 };
  };

  // Muestra un diff side-by-side en la pestaña indicada (sort/merge).
  const showDiff = (type, title, original, processed) => {
    buildShellIfNeeded();
    if (!views[type]) return;

    // Activamos la pestaña correspondiente.
    switchType(type);

    // Creamos entrada base y calculamos el diff.
    const { entry, pre1, pre2 } = crearEntradaBase(title);
    const diff = buildSideBySideHtml(original, processed);

    // Inyectamos HTML ya formateado en ambos lados.
    pre1.innerHTML = diff.originalHtml;
    pre2.innerHTML = diff.processedHtml;

    // Metemos esta entrada dentro de la vista correspondiente (sort/merge).
    views[type].appendChild(entry);
  };

  // ============================================================
  // API PÚBLICA (window.Log)
  // ============================================================

  // Exponemos funciones simples para usar desde el resto de la app:
  // - Log.line("mensaje")
  // - Log.clear()
  // - Log.showSortDiff(filename, originalText, processedText)
  // - Log.showMergeDiff(label, originalName, newName, originalXml, mergedXml)
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
