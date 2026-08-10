"use strict";

const PAGE_SIZE = 4096;
const COLS = 256;
const CELL = 4;
const MAX_FILE = 256 * 1024 * 1024;

const state = {
  bytes: null,
  size: 0,
  name: "data",
  base: 0x100000000,
  metric: "nonzero",
  colorName: "viridis",
  values: null,
  pages: 0,
  regions: [],
  markers: [],
  selectedAddr: null,
  transform: d3.zoomIdentity,
  deckMode: false,
};

const VU_COLORS = [
  [22, 197, 94],
  [74, 222, 128],
  [132, 204, 22],
  [163, 230, 53],
  [250, 204, 21],
  [251, 191, 36],
  [251, 146, 60],
  [249, 115, 22],
  [239, 68, 68],
  [220, 38, 38],
];
const VU_SEGMENTS = 12;

function vuLevel(level) {
  return Math.min(9, Math.max(0, Math.floor(level * 10)));
}

function vuColor(level) {
  return VU_COLORS[vuLevel(level)];
}

function vuCss(level) {
  const c = vuColor(level);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

let worker = null;
try {
  worker = new Worker(new URL("worker.js", location.href));
} catch (err) {
  worker = null;
}
let jobId = 0;
let pendingJob = 0;
const colorScales = {
  viridis: d3.scaleSequential(d3.interpolateViridis),
  inferno: d3.scaleSequential(d3.interpolateInferno),
  plasma: d3.scaleSequential(d3.interpolatePlasma),
  turbo: d3.scaleSequential(d3.interpolateTurbo),
  cividis: d3.scaleSequential(d3.interpolateCividis),
  heat: d3.scaleSequential(d3.interpolateRdYlBu),
};
let colorLUT = [];

const $ = (id) => document.getElementById(id);

if (worker) {
  worker.onmessage = (ev) => {
    const { id, values, length } = ev.data;
    if (id !== pendingJob) return;
    state.values = new Float32Array(values);
    state.pages = state.values.length;
    console.assert(state.pages === length);
    setStatus("メトリック計算完了");
    renderAll();
  };
}

function init() {
  buildLevelMeter();
  buildLUT();
  drawLegend();
  bindZoom();
  bindEvents();
  configureDefaults();
}

function buildLevelMeter() {
  const meter = $("levelMeter");
  meter.innerHTML = "";
  for (let i = 0; i < VU_SEGMENTS; i++) {
    const seg = document.createElement("span");
    seg.className = "seg";
    meter.appendChild(seg);
  }
  updateLevelMeter(0);
  updateTape("0x00000000");
}

function updateLevelMeter(v) {
  const n = Math.max(0, Math.min(VU_SEGMENTS, Math.round((v || 0) * VU_SEGMENTS)));
  const segs = $("levelMeter").children;
  for (let i = 0; i < segs.length; i++) segs[i].classList.toggle("on", i < n);
}

function updateTape(text) {
  $("tapeCounter").textContent = text;
}

function configureDefaults() {
  state.regions = [];
  state.markers = [];
  renderLayers();
  updateFileInfo(null);
}

/* ---- metrics ---- */
function requestMetrics() {
  if (!state.bytes) return;
  const id = ++jobId;
  pendingJob = id;
  setStatus("メトリック計算中 …");
  if (worker) {
    const copy = state.bytes.slice();
    worker.postMessage(
      { id, buffer: copy.buffer, pageSize: PAGE_SIZE, metric: state.metric },
      [copy.buffer],
    );
    return;
  }
  const values = computeMetricsSync(state.bytes, state.metric);
  state.values = values;
  state.pages = values.length;
  setStatus("メトリック計算完了");
  renderAll();
}

function computeMetricsSync(data, metric) {
  const pages = Math.ceil(data.length / PAGE_SIZE);
  const out = new Float32Array(pages);
  for (let i = 0; i < pages; i++) {
    const s = i * PAGE_SIZE;
    const e = Math.min(s + PAGE_SIZE, data.length);
    const n = e - s;
    if (metric === "nonzero") {
      let nz = 0;
      for (let j = s; j < e; j++) if (data[j] !== 0) nz++;
      out[i] = nz / n;
    } else if (metric === "string") {
      let p = 0;
      for (let j = s; j < e; j++) {
        const b = data[j];
        if (b === 9 || (b >= 32 && b < 127)) p++;
      }
      out[i] = p / n;
    } else {
      const hist = new Uint32Array(256);
      for (let j = s; j < e; j++) hist[data[j]]++;
      let ent = 0;
      for (let k = 0; k < 256; k++) {
        if (!hist[k]) continue;
        const p = hist[k] / n;
        ent -= p * Math.log2(p);
      }
      out[i] = ent / 8;
    }
  }
  return out;
}

function loadBinary(arrayBuffer, base, name, keepLayers) {
  if (arrayBuffer.byteLength > MAX_FILE) {
    setStatus("警告: ファイルが大きすぎます（上限 256MiB）", "warn");
    return false;
  }
  if (arrayBuffer.byteLength === 0) {
    setStatus("警告: ファイルが空です", "warn");
    return false;
  }
  state.bytes = new Uint8Array(arrayBuffer);
  state.size = state.bytes.length;
  if (name) state.name = name;
  if (base !== undefined && base !== null && !isNaN(base)) state.base = base;
  if (!keepLayers) {
    state.regions = [];
    state.markers = [];
  }
  state.selectedAddr = null;
  updateFileInfo();
  resetZoom();
  renderLayers();
  requestMetrics();
  return true;
}

/* ---- rendering ---- */
function buildLUT() {
  colorLUT = [];
  const scale = colorScales[state.colorName].domain([0, 1]);
  for (let i = 0; i < 256; i++) {
    const c = d3.color(scale(i / 255));
    colorLUT.push([Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
  }
}

function drawLegend() {
  const canvas = $("legend");
  const w = 300, h = 14;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (state.deckMode) {
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = vuCss(x / (w - 1));
      ctx.fillRect(x, 0, 1, h);
    }
    return;
  }
  const scale = colorScales[state.colorName].domain([0, 1]);
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = scale(x / (w - 1));
    ctx.fillRect(x, 0, 1, h);
  }
}

function renderAll() {
  const rows = Math.max(1, Math.ceil(state.pages / COLS));
  const canvas = $("canvas");
  canvas.width = COLS * CELL;
  canvas.height = rows * CELL;

  const img = document.createElement("canvas");
  img.width = COLS;
  img.height = rows;
  const ictx = img.getContext("2d", { willReadFrequently: true });
  const imageData = ictx.createImageData(COLS, rows);
  const px = imageData.data;

  for (let i = 0; i < state.pages; i++) {
    const v = state.values[i];
    const level = Math.pow(v, 0.55);
    const c = state.deckMode ? vuColor(level) : colorLUT[Math.min(255, Math.floor(level * 255))];
    const off = i * 4;
    px[off] = c[0];
    px[off + 1] = c[1];
    px[off + 2] = c[2];
    px[off + 3] = 255;
  }
  ictx.putImageData(imageData, 0, 0);

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, COLS * CELL, rows * CELL);

  if (state.deckMode) drawDeckOverlay(ctx, rows);

  updateFileInfo();
  renderLayers();
}

function drawDeckOverlay(ctx, rows) {
  ctx.fillStyle = "#0b0d12";
  for (let x = CELL; x <= COLS * CELL; x += CELL) {
    ctx.fillRect(x - 1, 0, 1, ctx.canvas.height);
  }
  for (let y = CELL; y <= rows * CELL; y += CELL) {
    ctx.fillRect(0, y - 1, ctx.canvas.width, 1);
  }
  ctx.fillStyle = "#ffe08a";
  for (let r = 0; r < rows; r++) {
    let best = -1, bc = 0;
    for (let c = 0; c < COLS; c++) {
      const pg = r * COLS + c;
      if (pg >= state.pages) break;
      if (state.values[pg] > best) { best = state.values[pg]; bc = c; }
    }
    ctx.fillRect(bc * CELL, r * CELL, CELL, 2);
  }
}

function pageToXY(page) {
  return { x: (page % COLS) * CELL, y: Math.floor(page / COLS) * CELL };
}

function renderLayers() {
  renderRegionsLayer();
  renderMarkersLayer();
  renderRegionSummary();
  renderMarkerList();
}

function pageInfo() {
  return { rows: Math.max(1, Math.ceil(state.pages / COLS)), cols: COLS };
}

function renderRegionsLayer() {
  $("layerRegions").innerHTML = "";
  $("layerRegions").setAttribute("viewBox", `0 0 ${COLS * CELL} ${pageInfo().rows * CELL}`);
  if (!$("chkRegions").checked) return;
  const opacity = Number($("regOpacity").value);

  for (const r of state.regions) {
    const p0 = Math.max(0, Math.floor((r.start - state.base) / PAGE_SIZE));
    const p1 = Math.min(state.pages, Math.ceil((r.end - state.base) / PAGE_SIZE));
    if (p0 >= p1) continue;

    const row0 = Math.floor(p0 / COLS);
    const row1 = Math.floor((p1 - 1) / COLS);
    let x, width;
    if (row0 === row1) {
      x = (p0 % COLS) * CELL;
      width = ((p1 - 1) % COLS + 1 - (p0 % COLS)) * CELL;
    } else {
      x = 0;
      width = COLS * CELL;
    }
    const y = row0 * CELL;
    const height = (row1 - row0 + 1) * CELL;

    const svgns = "http://www.w3.org/2000/svg";
    const rect = document.createElementNS(svgns, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", width);
    rect.setAttribute("height", height);
    rect.setAttribute("fill", r.color);
    rect.setAttribute("fill-opacity", opacity);
    rect.setAttribute("stroke", r.color);
    rect.setAttribute("stroke-opacity", Math.min(1, opacity * 2));
    rect.setAttribute("stroke-width", 1);
    rect.setAttribute("class", "region");
    $("layerRegions").appendChild(rect);
  }
}

function renderMarkersLayer() {
  $("layerMarkers").innerHTML = "";
  $("layerMarkers").setAttribute("viewBox", `0 0 ${COLS * CELL} ${pageInfo().rows * CELL}`);
  if (!$("chkMarkers").checked) return;
  const opacity = Number($("markOpacity").value);

  const svgns = "http://www.w3.org/2000/svg";
  for (const m of state.markers) {
    const page = Math.floor((m.addr - state.base) / PAGE_SIZE);
    if (page < 0 || page >= state.pages) continue;
    const { x, y } = pageToXY(page);
    const cx = x + CELL / 2;
    const cy = y + CELL / 2;

    const g = document.createElementNS(svgns, "g");
    g.setAttribute("opacity", opacity);
    const circle = document.createElementNS(svgns, "circle");
    circle.setAttribute("cx", cx);
    circle.setAttribute("cy", cy);
    circle.setAttribute("r", CELL * 1.3);
    circle.setAttribute("fill", "#ffea00");
    circle.setAttribute("stroke", "#000");
    circle.setAttribute("stroke-width", 0.6);
    g.appendChild(circle);

    const text = document.createElementNS(svgns, "text");
    text.setAttribute("x", cx + 3);
    text.setAttribute("y", cy - 3);
    text.setAttribute("fill", "#ffea00");
    text.setAttribute("font-size", 10);
    text.setAttribute("font-family", "ui-monospace, Menlo, monospace");
    text.textContent = m.label;
    g.appendChild(text);

    g.style.cursor = "pointer";
    g.addEventListener("mouseover", (ev) => {
      showTooltip(ev, `<strong>${m.label}</strong><br><code>0x${m.addr.toString(16)}</code>`);
    });
    g.addEventListener("mousemove", (ev) => moveTooltip(ev));
    g.addEventListener("mouseout", () => hideTooltip());

    $("layerMarkers").appendChild(g);
  }
}

function renderRegionSummary() {
  const wrap = $("regList");
  wrap.innerHTML = "";
  if (!state.regions.length) {
    wrap.innerHTML = '<p style="margin:0;color:var(--text-dim);font-size:12px">領域なし</p>';
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "layer-list";
  for (const r of state.regions) {
    const used = estimateUsed(r);
    const li = document.createElement("li");
    const color = document.createElement("span");
    color.className = "swatch";
    color.style.background = r.color;
    const name = document.createElement("span");
    name.textContent = r.name.replace(/^__/, "");
    name.style.color = "var(--text)";
    const val = document.createElement("span");
    val.textContent = used === null ? "—" : `${used.toFixed(1)} MiB`;
    val.style = "margin-left:auto";
    li.append(color, name, val);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
  $("#regTotal").textContent = estimateAll() + " MiB (推定利用)";
}

function estimateUsed(region) {
  if (!state.values) return null;
  const p0 = Math.max(0, Math.floor((region.start - state.base) / PAGE_SIZE));
  const p1 = Math.min(state.pages, Math.ceil((region.end - state.base) / PAGE_SIZE));
  if (p0 >= p1) return null;
  let sum = 0;
  for (let i = p0; i < p1; i++) sum += state.values[i];
  return (sum * PAGE_SIZE) / (1024 * 1024);
}

function estimateAll() {
  if (!state.values) return 0;
  let sum = 0;
  for (let i = 0; i < state.pages; i++) sum += state.values[i];
  return ((sum * PAGE_SIZE) / (1024 * 1024)).toFixed(1);
}

function renderMarkerList() {
  const wrap = $("markList");
  wrap.innerHTML = "";
  if (!state.markers.length) {
    wrap.innerHTML = '<p style="margin:0;color:var(--text-dim);font-size:12px">マーカーなし</p>';
    return;
  }
  const ul = document.createElement("ul");
  ul.className = "layer-list";
  for (const m of state.markers) {
    const li = document.createElement("li");
    const icon = document.createElement("span");
    icon.textContent = "●";
    icon.style.color = "#ffea00";
    const name = document.createElement("span");
    name.textContent = m.label;
    name.style.color = "var(--text)";
    const addr = document.createElement("span");
    addr.textContent = `0x${m.addr.toString(16)}`;
    li.append(icon, name, addr);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
}

/* ---- tooltip ---- */
function showTooltip(ev, html) {
  const t = $("tooltip");
  t.innerHTML = html;
  t.style.opacity = 1;
  moveTooltip(ev);
}

function moveTooltip(ev) {
  const t = $("tooltip");
  t.style.left = ev.pageX + 12 + "px";
  t.style.top = ev.pageY - 10 + "px";
}

function hideTooltip() {
  $("tooltip").style.opacity = 0;
}

function showPageTooltip(ev, page) {
  if (page < 0 || page >= state.pages || !state.values) return hideTooltip();
  const addr = state.base + page * PAGE_SIZE;
  const v = state.values[page];
  const pct = (v * 100).toFixed(1);
  const metricLabel = state.metric === "nonzero" ? "非ゼロ率"
    : state.metric === "entropy" ? "エントロピー"
    : "文字密度";
  showTooltip(
    ev,
    `<strong>Page</strong> ${page}<br>` +
    `<strong>Addr</strong> <code>0x${addr.toString(16)}</code><br>` +
    `<strong>${metricLabel}</strong> ${pct}%`,
  );
}

function canvasToPage(ev) {
  const pt = d3.pointer(ev, $("canvas"));
  const col = Math.floor(pt[0] / CELL);
  const row = Math.floor(pt[1] / CELL);
  const page = row * COLS + col;
  return page < state.pages ? page : -1;
}

/* ---- zoom ---- */
function bindZoom() {
  const zoom = d3
    .zoom()
    .scaleExtent([0.25, 64])
    .on("zoom", (ev) => {
      state.transform = ev.transform;
      $("zoomable").style.transform = `translate(${ev.transform.x}px, ${ev.transform.y}px) scale(${ev.transform.k})`;
      $("zoomInfo").textContent = `ズーム ${ev.transform.k.toFixed(2)}x`;
    });
  d3.select("#heat").call(zoom).on("dblclick.zoom", null);
}

function resetZoom() {
  d3.select("#heat").call(d3.zoom().transform, d3.zoomIdentity);
}

/* ---- events ---- */
function bindEvents() {
  $("fileInput").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const ok = loadBinary(e.target.result, parseBase(), file.name);
      if (ok) $("fileInput").value = "";
    };
    reader.readAsArrayBuffer(file);
  });

  $("sampleBtn").addEventListener("click", () => {
    setStatus("サンプル生成中 …");
    setTimeout(() => {
      const sample = window.generateSample();
      $("baseInput").value = "0x" + sample.base.toString(16);
      state.regions = sample.regions.slice();
      state.markers = sample.markers.slice();
      loadBinary(sample.bytes.buffer, sample.base, "サンプル", true);
      $("sourceLabel").textContent = "サンプル: llama-server (合成)";
    }, 30);
  });

  $("metricSel").addEventListener("change", (ev) => {
    state.metric = ev.target.value;
    requestMetrics();
  });

  $("colorSel").addEventListener("change", (ev) => {
    state.colorName = ev.target.value;
    buildLUT();
    if (state.values) renderAll();
    drawLegend();
  });

  $("deckToggle").addEventListener("change", (ev) => {
    state.deckMode = ev.target.checked;
    $("deckPanel").style.display = state.deckMode ? "" : "none";
    $("deckLamp").classList.toggle("on", state.deckMode);
    drawLegend();
    if (state.values) renderAll();
  });

  $("applyBaseBtn").addEventListener("click", () => {
    const base = parseBase();
    if (base === null) return;
    state.base = base;
    if (state.bytes) renderLayers();
  });

  const canvas = $("canvas");
  canvas.addEventListener("mousemove", (ev) => {
    const page = canvasToPage(ev);
    showPageTooltip(ev, page);
    if (page >= 0) {
      updateLevelMeter(state.values[page]);
      updateTape("0x" + (state.base + page * PAGE_SIZE).toString(16).padStart(8, "0"));
    } else {
      updateLevelMeter(0);
    }
  });
  canvas.addEventListener("mouseout", () => hideTooltip());
  canvas.addEventListener("click", (ev) => {
    const page = canvasToPage(ev);
    if (page >= 0) inspectPage(page);
  });
  canvas.addEventListener("dblclick", (ev) => {
    const page = canvasToPage(ev);
    if (page < 0) return;
    const addr = state.base + page * PAGE_SIZE;
    const label = prompt("マーカーラベル:", "注釈");
    if (label === null) return;
    state.markers.push({ addr, label: label || `0x${addr.toString(16)}` });
    renderLayers();
  });

  $("chkRegions").addEventListener("change", renderLayers);
  $("chkMarkers").addEventListener("change", renderLayers);
  $("regOpacity").addEventListener("input", renderLayers);
  $("markOpacity").addEventListener("input", renderLayers);

  $("regFile").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseRegionsJson(e.target.result);
      if (!parsed) return;
      state.regions = parsed;
      renderLayers();
      setStatus(`領域を ${parsed.length} 件読込`);
    };
    reader.readAsText(file, "utf-8");
  });

  $("markFile").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseMarkersJson(e.target.result);
      if (!parsed) return;
      state.markers = parsed;
      renderLayers();
      setStatus(`マーカーを ${parsed.length} 件読込`);
    };
    reader.readAsText(file, "utf-8");
  });

  $("clearRegionsBtn").addEventListener("click", () => {
    state.regions = [];
    renderLayers();
  });
  $("clearMarkersBtn").addEventListener("click", () => {
    state.markers = [];
    renderLayers();
  });

  $("searchBtn").addEventListener("click", () => {
    const addr = parseAddr($("addrInput").value);
    if (addr === null) {
      setStatus("アドレスを 0x… 形式で入力してください", "warn");
      return;
    }
    jumpToAddr(addr);
  });
  $("addrInput").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") $("searchBtn").click();
  });

  $("selAddrBtn").addEventListener("click", () => {
    if (state.selectedAddr === null) {
      setStatus("先にセルをクリックしてアドレスを選択してください", "warn");
      return;
    }
    const label = prompt("マーカーラベル:", "注釈");
    if (label === null) return;
    state.markers.push({ addr: state.selectedAddr, label: label || `0x${state.selectedAddr.toString(16)}` });
    renderLayers();
  });
}

function parseBase() {
  const v = $("baseInput").value.trim();
  const base = parseAddr(v);
  if (base === null) {
    setStatus("base アドレスが不正です", "warn");
    return null;
  }
  return base;
}

function parseAddr(s) {
  const t = s.replace(/[,\s]/g, "");
  if (!/^0x[0-9a-fA-F]+$/.test(t)) return null;
  return parseInt(t, 16);
}

function inspectPage(page) {
  const addr = state.base + page * PAGE_SIZE;
  state.selectedAddr = addr;
  updateTape("0x" + addr.toString(16).padStart(8, "0"));
  $("#inspAddr").textContent = `0x${addr.toString(16)}  (File offset 0x${(page * PAGE_SIZE).toString(16)})`;

  const grid = $("inspBody");
  grid.innerHTML = "";
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, state.size);
  const rows = Math.ceil((end - start) / 16);

  for (let r = 0; r < rows; r++) {
    const rowAddr = start + r * 16;
    const a = document.createElement("div");
    a.className = "addr";
    a.textContent = "0x" + rowAddr.toString(16);

    const h = document.createElement("div");
    h.className = "hex";
    const bytes = [];
    for (let c = 0; c < 16; c++) {
      const off = rowAddr + c;
      bytes.push(off < end ? state.bytes[off].toString(16).padStart(2, "0") : "  ");
    }
    h.textContent = bytes.join(" ");

    const t = document.createElement("div");
    t.className = "ascii";
    let asc = "";
    for (let c = 0; c < 16; c++) {
      const off = rowAddr + c;
      if (off >= end) { asc += " "; continue; }
      const b = state.bytes[off];
      asc += b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
    }
    t.textContent = asc;

    grid.append(a, h, t);
  }
  $("inspector").style.display = "block";
}

function jumpToAddr(addr) {
  const page = Math.floor((addr - state.base) / PAGE_SIZE);
  if (page < 0 || page >= state.pages) {
    setStatus(`アドレス 0x${addr.toString(16)} は範囲外です`, "warn");
    return;
  }
  inspectPage(page);
  const { x, y } = pageToXY(page);
  const zoom = state.transform;
  const k = Math.max(zoom.k, 16);
  const tx = -x * k + $("heat").clientWidth / 2;
  const ty = -y * k + $("heat").clientHeight / 2;
  d3.select("#heat").call(d3.zoom().transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  setStatus(`ジャンプ: 0x${addr.toString(16)} → Page ${page}`);
}

function parseRegionsJson(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.regions;
    if (!Array.isArray(list)) throw new Error("regions 配列がありません");
    return list.map((r) => ({
      name: String(r.name || "region"),
      start: Number(r.start),
      end: Number(r.start) + Number(r.size || 0),
      size: Number(r.size || 0),
      color: r.color || "#4f8cff",
    }));
  } catch (err) {
    setStatus("領域JSONのパースに失敗: " + err.message, "warn");
    return null;
  }
}

function parseMarkersJson(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.markers;
    if (!Array.isArray(list)) throw new Error("markers 配列がありません");
    return list.map((m) => ({
      addr: Number(m.addr),
      label: String(m.label || `0x${Number(m.addr).toString(16)}`),
    }));
  } catch (err) {
    setStatus("マーカーJSONのパースに失敗: " + err.message, "warn");
    return null;
  }
}

function updateFileInfo() {
  if (state.bytes) {
    const mb = (state.size / (1024 * 1024)).toFixed(2);
    $("fileInfo").innerHTML =
      `<b>${state.name}</b> — ${mb} MiB / ${state.pages} pages / 4KiB/page`;
  } else {
    $("fileInfo").textContent = "データ未読込";
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("warn", kind === "warn");
}

document.addEventListener("DOMContentLoaded", init);