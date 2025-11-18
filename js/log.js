(function () {
  "use strict";

  // ============================================
  // DEBUG: pon DEBUG = true para ver logs en consola
  // ============================================
  const DEBUG = false;

  // Función helper para loguear solo cuando DEBUG = true
  const dbg = (...args) => {
    // Verifica que DEBUG esté activo y que exista console.log
    if (DEBUG && typeof console !== "undefined" && console.log) {
      console.log("[Log.js]", ...args);
    }
  };

  // Estado interno del módulo
  // built  → indica si ya se construyó la interfaz de tabs del log
  // current → tipo de vista actual ("sort" o "merge")
  // views → referencia a los contenedores de cada pestaña { sort: <div>, merge: <div> }
  // tabs → referencia a los botones de pestaña { sort: <button>, merge: <button> }
  // root → referencia al contenedor principal #log
  let built = false,
    current = "sort",
    views = {}, // { sort: <div>, merge: <div> }
    tabs = {}, // { sort: <button>, merge: <button> }
    root; // <div id="log">

  // Obtiene el contenedor raíz donde se monta todo el log
  const getRoot = () => document.getElementById("log");

  // Helper para crear elementos DOM de forma compacta
  // tag → tipo de elemento ("div", "button", "pre", etc.)
  // cls → className (string)
  // txt → textContent inicial
  const createEl = (tag, cls, txt) =>
    Object.assign(document.createElement(tag), {
      className: cls || "",
      textContent: txt || "",
    });

  // Escapar HTML para evitar que se “inyecten” tags en el <pre>
  // Convierte caracteres especiales en entidades HTML (&, <, >)
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  // ============================================
  // CREAR SHELL / TABS SOLO UNA VEZ
  // ============================================
  const buildShellIfNeeded = () => {
    // Si ya se construyó, no hacer nada
    if (built) return;

    // Busca el contenedor #log
    root = getRoot();
    if (!root) {
      dbg("No se encontró #log en el DOM.");
      return;
    }

    // Configura la clase y limpia cualquier contenido previo
    root.className = "log-container";
    root.innerHTML = "";

    // Info de pestañas: tipo interno y texto que se muestra
    const tabInfo = [
      ["sort", "SORT & PURGE"],
      ["merge", "REPLACE & MERGE"],
    ];

    // Contenedor para pestañas y contenedor para vistas
    const tabBar = createEl("div", "log-tabs"),
      viewBox = createEl("div", "log-views");

    // Construcción de cada pestaña y su vista correspondiente
    tabInfo.forEach(([key, label], i) => {
      // Botón de pestaña
      const tab = createEl(
        "button",
        `log-tab${i === 0 ? " log-tab-active" : ""}`, // la primera pestaña arranca activa
        label
      );
      tab.type = "button";
      tab.dataset.type = key; // guarda el tipo ("sort" o "merge")
      tab.onclick = () => {
        dbg("Click en tab:", key);
        switchType(key); // cambia la pestaña al hacer click
      };

      // Vista asociada a la pestaña (contenedor donde se ponen los diffs)
      const view = createEl(
        "div",
        `log-view${i === 0 ? " log-view-active" : ""}` // primera vista activa
      );
      view.id = `log-${key}-view`;

      // Guardar referencias al botón y a la vista
      tabs[key] = tab;
      views[key] = view;

      // Agregar al DOM
      tabBar.appendChild(tab);
      viewBox.appendChild(view);
    });

    // Insertar las pestañas y vistas dentro del root
    root.appendChild(tabBar);
    root.appendChild(viewBox);

    // Marcar que ya se construyó el shell
    built = true;
    dbg("Shell de log construido.");
  };

  // Cambia de pestaña (sort / merge)
  const switchType = (type) => {
    // Si aún no se construyó el shell, no hacer nada
    if (!built) return;

    // Validar que exista la pestaña y la vista
    if (!tabs[type] || !views[type]) {
      dbg("switchType: tipo inválido:", type);
      return;
    }

    // Actualizar el tipo actual
    current = type;

    // Activar la pestaña correspondiente y desactivar las otras
    Object.keys(tabs).forEach((k) => {
      const active = k === type;
      tabs[k].classList.toggle("log-tab-active", active);
      views[k].classList.toggle("log-view-active", active);
    });

    dbg("Cambió a pestaña:", type);
  };

  // ============================================
  // LOG LINE SIMPLE (texto plano en la parte de abajo)
  // ============================================
  // Esta función agrega una línea simple de texto al final del contenedor root
  // Se puede usar para mensajes cortos/descriptivos
  const line = (msg, kind = "info") => {
    buildShellIfNeeded();
    if (!root) return;

    // Crea un div con clase según el tipo (info, error, etc.)
    const div = createEl("div", `log-line-${kind}`, msg);
    root.appendChild(div);

    // Auto-scroll al final para ver la última línea agregada
    root.scrollTop = root.scrollHeight;

    dbg("Log.line:", { kind, msg });
  };

  // Limpia todas las vistas (sort/merge)
  const clear = () => {
    buildShellIfNeeded();
    // Borra el contenido HTML de cada vista
    Object.values(views).forEach((v) => (v.innerHTML = ""));
    dbg("Log.clear(): vistas limpiadas.");
  };

  // ============================================
  // HELPERS DE DIFF
  // ============================================

  // Cuenta cuántas veces aparece cada línea en un arreglo de strings
  // Regresa un objeto { linea: conteo }
  const contarLineas = (arr) => {
    const map = {};
    arr.forEach((l) => (map[l] = (map[l] || 0) + 1));
    return map;
  };

  // Extrae name="..." de un <StaticMesh ...> o <ActorMesh ...>
  // Esto se usa para emparejar líneas originales y procesadas por el mismo name
  const getMeshKey = (line) => {
    const m = line.match(/<(StaticMesh|ActorMesh)[^>]*\sname="([^"]+)"/);
    return m ? m[2] : null; // devuelve solo el value de name="..."
  };

  // Diff genérico de línea con TAG XML + atributos
  // Aplica a <StaticMesh>, <ActorMesh>, <mesh>, <tag>, <Transform>, etc.
  // Reglas:
  // - cabecera del tag: <TagName → cyan
  // - atributo sin cambio: k="value" todo en cyan
  // - atributo con cambio:
  //   * SOLO label="..." de StaticMesh/ActorMesh va en amarillo
  //   * el resto de atributos de StaticMesh/ActorMesh se quedan en cyan aunque cambien
  //   * para otros tags, diff normal (tachado/amarillo)
  // - <tag value="..."> siempre cyan, sin amarillo
  const diffXmlTagLine = (oldLine, newLine) => {
    // Expresión regular para separar:
    // h1 = inicio del tag (con indentación + <TagName)
    // attrsX = atributos dentro del tag
    // tX = resto hasta el final de la línea (incluye ">" y lo que sigue)
    const tagRe = /^(\s*<[^>\s]+)([^>]*)(>.*)$/;
    const mo = oldLine.match(tagRe),
      mn = newLine.match(tagRe);

    // Si alguna de las líneas no cumple el patrón, devolver null
    if (!mo || !mn) return null;

    const [_, h1, attrs1, t1] = mo;
    const [__, h2, attrs2, t2] = mn;

    // Extraer el nombre del tag, por ejemplo "StaticMesh" de "<StaticMesh ..."
    const tnMatch = h1.match(/<\s*([^\s>]+)/);
    const tagName = tnMatch ? tnMatch[1] : "";

    // Flags para saber si el tag es de tipo mesh o tag value
    const isMeshTag = tagName === "StaticMesh" || tagName === "ActorMesh";
    const isTagTag = tagName === "tag";

    // Función para parsear atributos en forma:
    // attrs: string → { obj: {k:val}, order:[k1,k2,...] }
    const extractAttrs = (str) => {
      const obj = {};
      const order = [];
      let m;
      const re = /(\w+)\s*=\s*"([^"]*)"/g;
      // Recorre todos los atributos k="v"
      while ((m = re.exec(str))) {
        obj[m[1]] = m[2];
        order.push(m[1]); // orden en el que aparecieron
      }
      return [obj, order];
    };

    const [oldAttrs, oldKeys] = extractAttrs(attrs1);
    const [newAttrs, newKeys] = extractAttrs(attrs2);

    // Construye el HTML de los atributos, comparando old vs new
    // side = "old" para la línea original, "new" para la procesada
    const buildAttrsHtml = (selfAttrs, selfKeys, otherAttrs, side) => {
      const pieces = [];

      selfKeys.forEach((k) => {
        const val = selfAttrs[k]; // valor de atributo en esta línea
        const existsInOther = Object.prototype.hasOwnProperty.call(
          otherAttrs,
          k
        );
        let seg;

        // TAG <tag value="..."> SIEMPRE CYAN
        if (isTagTag && k === "value") {
          seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
            val
          )}"</span>`;
        } else if (!existsInOther) {
          // Atributo que solo existe en este lado (add/remove)

          if (isMeshTag && k !== "label") {
            // En StaticMesh/ActorMesh SOLO label va en amarillo; el resto cyan
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else if (isMeshTag && k === "label") {
            // label agregado/eliminado → amarillo
            if (side === "old") {
              // En línea original se marca como borrado (tachado)
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              // En línea nueva se marca como agregado (mark amarillo)
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          } else {
            // Otros tags (no mesh) → diff normal (tachado o mark)
            if (side === "old") {
              seg = `<s>${escapeHtml(k)}="${escapeHtml(val)}"</s>`;
            } else {
              seg = `<mark>${escapeHtml(k)}="${escapeHtml(val)}"</mark>`;
            }
          }
        } else {
          // Atributo existe en ambos lados, verificar si cambió el valor
          const otherVal = otherAttrs[k];

          if (val === otherVal) {
            // SIN CAMBIO → atributo completo cyan
            seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
              val
            )}"</span>`;
          } else {
            // CAMBIO DE VALOR
            if (isMeshTag && k !== "label") {
              // En StaticMesh/ActorMesh, solo label se resalta.
              // name, layer, etc. se quedan cyan aunque cambien.
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else if (isMeshTag && k === "label") {
              // label de StaticMesh/ActorMesh → amarillo solo en el valor
              if (side === "old") {
                // Línea original → valor tachado
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<s>${escapeHtml(val)}</s>` +
                  `<span class="cyan">"</span>`;
              } else {
                // Línea nueva → valor resaltado
                seg =
                  `<span class="cyan">${escapeHtml(k)}="</span>` +
                  `<mark>${escapeHtml(val)}</mark>` +
                  `<span class="cyan">"</span>`;
              }
            } else if (isTagTag && k === "value") {
              // Seguridad extra para <tag value="..."> → siempre cyan
              seg = `<span class="cyan">${escapeHtml(k)}="${escapeHtml(
                val
              )}"</span>`;
            } else {
              // Otros tags → diff normal (cambiar solo el valor)
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

        // Agrega un espacio antes del atributo para mantener formato
        pieces.push(" " + seg);
      });

      return pieces.join("");
    };

    // HTML de atributos para línea original
    const oldAttrsHtml = buildAttrsHtml(oldAttrs, oldKeys, newAttrs, "old");
    // HTML de atributos para línea nueva
    const newAttrsHtml = buildAttrsHtml(newAttrs, newKeys, oldAttrs, "new");

    // Ahora también pintamos el ">" y el resto de t1/t2 en cyan
    const oldHtml =
      `<span class="cyan">${escapeHtml(h1)}</span>` +
      oldAttrsHtml +
      `<span class="cyan">${escapeHtml(t1)}</span>`;

    const newHtml =
      `<span class="cyan">${escapeHtml(h2)}</span>` +
      newAttrsHtml +
      `<span class="cyan">${escapeHtml(t2)}</span>`;

    // Regresa objeto con HTML para original y procesado
    return { oldHtml, newHtml };
  };

  // Diff genérico de UNA línea (fallback para cuando no es TAG con atributos)
  const diffLineFragments = (a, b) => {
    // 1) Intento diff de TAG con atributos
    const xml = diffXmlTagLine(a, b);
    if (xml) return xml;

    // 2) Si no es un tag con attrs, uso diff de texto plano
    // Encuentra el primer índice donde difieren
    let i = 0;
    const n = Math.min(a.length, b.length);
    while (i < n && a[i] === b[i]) i++;

    // Encuentra la parte común final (recorriendo desde el final)
    let j = a.length - 1,
      k = b.length - 1;
    while (j >= i && k >= i && a[j] === b[k]) {
      j--;
      k--;
    }

    // Construye HTML para la línea original (oldHtml)
    const oldHtml =
      // Parte inicial igual
      escapeHtml(a.slice(0, i)) +
      // Parte cambiada (tachada)
      (j >= i ? `<s>${escapeHtml(a.slice(i, j + 1))}</s>` : "") +
      // Parte final igual
      escapeHtml(a.slice(j + 1));

    // Construye HTML para la línea nueva (newHtml)
    const newHtml =
      escapeHtml(b.slice(0, i)) +
      (k >= i ? `<mark>${escapeHtml(b.slice(i, k + 1))}</mark>` : "") +
      escapeHtml(b.slice(k + 1));

    return { oldHtml, newHtml };
  };

  // Construye el HTML lado-a-lado para ORIG / PROCESADO
  // Recibe dos textos completos (original/procesado) y regresa HTML para las 2 columnas
  const buildSideBySideHtml = (origText, procText) => {
    // Divide en líneas por saltos de línea
    const oLines = String(origText).split(/\r?\n/),
      nLines = String(procText).split(/\r?\n/);

    dbg("buildSideBySideHtml: líneas", {
      original: oLines.length,
      procesado: nLines.length,
    });

    // Conteo de apariciones de cada línea
    const countO = contarLineas(oLines),
      countN = contarLineas(nLines);

    // Determinar cuántas veces es común cada línea en ambos textos
    const common = Object.fromEntries(
      [...new Set([...Object.keys(countO), ...Object.keys(countN)])].map(
        (k) => [k, Math.min(countO[k] || 0, countN[k] || 0)]
      )
    );

    // Marca cada línea como "common" (compartida) o "only" (solo aparece en uno)
    const tagLines = (lines, used, commonMap) =>
      lines.map((l) =>
        (used[l] = (used[l] || 0) + 1) <= commonMap[l] ? "common" : "only"
      );

    // stateO/stateN guardan el estado de cada línea (common/only)
    const stateO = tagLines(oLines, {}, common);
    const stateN = tagLines(nLines, {}, common);

    // Listas de líneas solo-en-original y solo-en-procesado
    const onlyOld = oLines
      .map((text, i) => (stateO[i] === "only" ? { i, text } : null))
      .filter(Boolean);
    const onlyNew = nLines
      .map((text, i) => (stateN[i] === "only" ? { i, text } : null))
      .filter(Boolean);

    // Agrupar esas líneas solo-* por name de StaticMesh/ActorMesh
    const byName = (list) =>
      list.reduce((map, l) => {
        const name = getMeshKey(l.text);
        if (!name) return map;
        (map[name] = map[name] || []).push(l.i);
        return map;
      }, {});

    const oBy = byName(onlyOld);
    const nBy = byName(onlyNew);

    // modO / modN almacenan HTML custom para líneas con diff de atributos
    const modO = {};
    const modN = {};

    // Emparejar solo StaticMesh/ActorMesh con mismo name y generar diff por atributos
    Object.keys(oBy).forEach((name) => {
      const os = oBy[name]; // índices en original
      const ns = nBy[name]; // índices en procesado
      if (!ns) return;
      // Empareja por orden (uno a uno)
      for (let i = 0; i < Math.min(os.length, ns.length); i++) {
        const d = diffLineFragments(oLines[os[i]], nLines[ns[i]]);
        modO[os[i]] = d.oldHtml;
        modN[ns[i]] = d.newHtml;
      }
    });

    // Generar HTML final de cada lado
    // tag → "s" para original (tachado), "mark" para procesado (amarillo)
    const render = (lines, state, mods, tag) =>
      lines
        .map((l, i) => {
          // Si hay línea vacía, colocar un espacio para no perder la altura
          const lineText = l || " ";

          // LÍNEAS <tag value="..."> SIEMPRE CYAN, NUNCA AMARILLO
          if (/^\s*<tag\b[^>]*\bvalue="/.test(lineText)) {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // LÍNEAS <Actor ...> (Survey Point, Project Base Point, Levels, etc.) SIEMPRE CYAN
          if (/^\s*<Actor\b/.test(lineText)) {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // LÍNEAS MARCADAS COMO "common" → cyan completo
          if (state[i] === "common") {
            return `<span class="cyan">${escapeHtml(lineText)}</span>`;
          }

          // Si hubo diff de atributos (StaticMesh/ActorMesh emparejados)
          if (mods[i]) {
            return mods[i];
          }

          // Resto de líneas solo-en-un-lado → tachado/amarillo completo según "tag"
          return `<${tag}>${escapeHtml(lineText)}</${tag}>`;
        })
        .join("\n");

    // Construir resultado para ambas columnas
    const result = {
      originalHtml: render(oLines, stateO, modO, "s"),
      processedHtml: render(nLines, stateN, modN, "mark"),
    };

    dbg("buildSideBySideHtml: diff generado.");
    return result;
  };

  // ============================================
  // CREAR ENTRADA (bloque con columnas de código)
  // ============================================
  // Crea la estructura básica de un bloque de log:
  // título + dos columnas (original / procesado) cada una con header y <pre>
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

    // Armar columna 1
    col1.append(h1, pre1);
    // Armar columna 2
    col2.append(h2, pre2);
    // Agregar columnas al contenedor
    columns.append(col1, col2);
    // Agregar header + columnas a la entrada
    entry.append(header, columns);

    // Retornar referencias para poder llenar los <pre>
    return { entry, pre1, pre2 };
  };

  // Muestra un diff dado un tipo de vista (sort/merge)
  // type → "sort" o "merge"
  // title → string a mostrar en el header del bloque
  // original → texto original completo
  // processed → texto procesado completo
  const showDiff = (type, title, original, processed) => {
    buildShellIfNeeded();

    // Validar que exista la vista solicitada
    if (!views[type]) {
      dbg("showDiff: tipo de vista inválido:", type);
      return;
    }

    // Cambia a la pestaña solicitada antes de mostrar el diff
    switchType(type);

    // Crea la estructura base de la entrada
    const { entry, pre1, pre2 } = crearEntradaBase(title);
    // Genera HTML lado a lado
    const diff = buildSideBySideHtml(original, processed);

    // Inserta el HTML en los <pre> de cada columna
    pre1.innerHTML = diff.originalHtml;
    pre2.innerHTML = diff.processedHtml;

    // Agrega la entrada a la vista correspondiente
    views[type].appendChild(entry);

    dbg("showDiff:", { type, title });
  };

  // ============================================
  // API PÚBLICA (window.Log)
  // ============================================
  // Se expone un objeto global "Log" para que otras partes de la app lo usen
  window.Log = {
    // Agregar línea simple al log (parte inferior)
    line,
    // Limpiar todas las vistas (sort y merge)
    clear,
    // Mostrar diff para la herramienta SORT & PURGE
    // fn = nombre de archivo, o "Archivo sin nombre" si no viene
    showSortDiff: (fn, o, p) =>
      showDiff("sort", fn || "Archivo sin nombre", o, p),

    // Mostrar diff para la herramienta REPLACE & MERGE
    // label → etiqueta general del merge
    // origName → nombre del archivo original
    // newName → nombre del archivo nuevo
    // origXml → contenido original
    // mergedXml → contenido ya mergeado
    showMergeDiff: (label, origName, newName, origXml, mergedXml) =>
      showDiff(
        "merge",
        [label, "ORIGINAL: " + origName, "NUEVO: " + newName]
          .filter(Boolean) // filtra vacíos
          .join(" · "), // une con separador
        origXml,
        mergedXml
      ),
  };
})();
