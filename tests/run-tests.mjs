// Memory Dump Visualizer テストスイート（依存なし / Node のみ）
// 実行: node tests/run-tests.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log("PASS  " + name);
  } catch (e) {
    fail++;
    console.log("FAIL  " + name + "  -> " + e.message);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m || "assert"); };
const approx = (a, b, eps = 0.02) => assert(Math.abs(a - b) <= eps, `${a} ~= ${b}`);

/* ---- DOM / d3 / Worker スタブ ---- */
function makeEl(id) {
  let _h = "";
  const el = {
    id, textContent: "", value: "", style: {}, checked: true,
    width: 0, height: 0, clientWidth: 800, clientHeight: 600,
    children: [], attrs: {}, classList: new Set(),
    get innerHTML() { return _h; },
    set innerHTML(v) { _h = v; if (v === "") this.children = []; },
    addEventListener() {},
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); },
    append(...cs) { for (const c of cs) this.children.push(c); },
    getContext() {
      return {
        imageSmoothingEnabled: false, fillStyle: "", canvas: el,
        fillRect() {}, clearRect() {}, drawImage() {},
        createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
        putImageData() {},
      };
    },
  };
  el.classList.toggle = (c, on) => { if (on) el.classList.add(c); else el.classList.delete(c); };
  return el;
}
const els = {};
global.window = {};
global.document = {
  getElementById: (id) => (els[id] ||= makeEl(id)),
  addEventListener() {},
  createElement: () => makeEl("_new"),
  createElementNS: () => makeEl("_ns"),
};
global.location = { href: "http://localhost/viewer.html" };
global.Worker = class { constructor() { throw new Error("no worker"); } };
global.d3 = {
  scaleSequential: () => { const f = (t) => "rgb(" + Math.round(t * 255) + ",0,0)"; f.domain = () => f; return f; },
  color: (s) => { const m = /^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/.exec(s); return m ? { r: +m[1], g: +m[2], b: +m[3] } : { r: 0, g: 0, b: 0 }; },
  interpolateViridis: () => "#fff", interpolateInferno: () => "#fff", interpolatePlasma: () => "#fff",
  interpolateTurbo: () => "#fff", interpolateCividis: () => "#fff", interpolateRdYlBu: () => "#fff",
  zoomIdentity: { x: 0, y: 0, k: 1 },
  zoom: () => ({ scaleExtent() { return this; }, on() { return this; } }),
  select: () => ({ call() { return { on() { return this } }; }, style() { return this; }, attr() { return this; } }),
  pointer: () => [0, 0],
};

function load(file) { new Function("window", "d3", "document", readFileSync(join(root, file), "utf8"))(global.window, global.d3, global.document); }
function loadViewer() {
  const code = readFileSync(join(root, "viewer.js"), "utf8") +
    "\nwindow.__t={computeMetricsSync,loadBinary,state,renderAll,renderLayers,renderRegionsLayer,buildLUT,buildLevelMeter,updateLevelMeter,updateTape,drawDeckOverlay,drawLegend,parseAddr,parseRegionsJson,parseMarkersJson,estimateUsed,estimateAll};";
  new Function("window", "d3", "document", code)(global.window, global.d3, global.document);
  return global.window.__t;
}
function evalWorker(data, pageSize = 4096, metric = "nonzero") {
  const code = readFileSync(join(root, "worker.js"), "utf8");
  let posted = null;
  const self = { postMessage: (m) => { posted = m; } };
  new Function("self", code + "\nreturn self.onmessage;")(self)({ data: { id: 1, buffer: data.buffer, pageSize, metric } });
  return new Float32Array(posted.values);
}

load("sample.js");
const t = loadViewer();

/* ---- worker ---- */
test("worker: 非ゼロ率", () => {
  const buf = new Uint8Array(3 * 4096);
  for (let i = 0; i < buf.length; i++) buf[i] = i % 251;
  const v = evalWorker(buf);
  assert(v.length === 3);
  approx(v[0], (4096 - 17) / 4096, 0.05);
});
test("worker: エントロピー上限≈1.0", () => {
  const buf = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) buf[i] = (i * 73 + 13) % 256;
  approx(evalWorker(buf, 4096, "entropy")[0], 1, 0.02);
});
test("worker: 全ゼロページ=0", () => assert(evalWorker(new Uint8Array(4096))[0] === 0));
test("worker: 末尾部分ページ", () => {
  const buf = new Uint8Array(5000).fill(1);
  const v = evalWorker(buf);
  assert(v.length === 2 && v[1] === 1);
});

/* ---- sample ---- */
test("sample: 構成整合", () => {
  const s = global.window.generateSample();
  assert(s.bytes.length === s.total && s.base === 0x100000000);
  assert(s.regions.length === 8 && s.markers.length === 4);
  let prev = s.base;
  for (const r of s.regions) {
    assert(r.start === prev && r.end === r.start + r.size);
    prev = r.end;
  }
  assert(s.total % 4096 === 0);
});

/* ---- viewer: ロードと計算 ---- */
test("viewer: サンプルロード→メトリック", () => {
  t.buildLUT();
  t.buildLevelMeter();
  const s = global.window.generateSample();
  t.state.regions = s.regions.slice();
  t.state.markers = s.markers.slice();
  assert(t.loadBinary(s.bytes.buffer, s.base, "サンプル", true));
  assert(t.state.pages === Math.ceil(s.total / 4096) && t.state.pages === t.state.values.length);
  assert(t.state.values[0] > 0 && t.state.values[t.state.pages - 1] > 0);
});

/* ---- viewer: 領域bbox ---- */
test("viewer: 多行領域bbox (model.weights)", () => {
  els["regOpacity"].value = "0.25";
  t.renderRegionsLayer();
  const rect = els["layerRegions"].children.find((c) => c.attrs && c.attrs.fill === "#fbbf24");
  assert(rect, "rect exists");
  assert(Number(rect.attrs.x) === 0 && Number(rect.attrs.width) === 1024);
  assert(Number(rect.attrs.height) === (73 - 10 + 1) * 4);
  assert(rect.attrs["fill-opacity"] == 0.25);
});
test("viewer: 単一行領域bbox", () => {
  t.state.regions = [{ name: "s", start: t.state.base + 100 * 4096, size: 128 * 4096, end: t.state.base + 228 * 4096, color: "#123456" }];
  t.renderRegionsLayer();
  const rect = els["layerRegions"].children.find((c) => c.attrs && c.attrs.fill === "#123456");
  assert(rect, "rect exists");
  assert(Number(rect.attrs.x) === 400 && Number(rect.attrs.width) === 512 && Number(rect.attrs.height) === 4);
});
test("viewer: 範囲外領域は矩形を作らない", () => {
  t.state.regions = [{ name: "out", start: t.state.base + 999999 * 4096, size: 4096, end: t.state.base + 1000000 * 4096, color: "#abcabc" }];
  t.renderRegionsLayer();
  assert(!els["layerRegions"].children.some((c) => c.attrs && c.attrs.fill === "#abcabc"));
});

/* ---- viewer: デッキモード ---- */
test("viewer: デッキモード描画", () => {
  t.state.deckMode = true;
  t.renderAll();
  t.drawLegend();
  t.state.deckMode = false;
  t.renderAll();
});
test("viewer: LEVEL メーター", () => {
  t.buildLevelMeter();
  t.updateLevelMeter(0.85);
  assert([...els["levelMeter"].children].filter((c) => c.classList.has("on")).length === 10);
  t.updateLevelMeter(0);
  assert([...els["levelMeter"].children].filter((c) => c.classList.has("on")).length === 0);
});

/* ---- viewer: パーサ ---- */
test("viewer: JSON パーサ正常系", () => {
  const p = t.parseRegionsJson(JSON.stringify({ regions: [{ name: "kv_cache", start: 0x100000000, size: 1048576, color: "#f00" }] }));
  assert(p && p[0].end === 0x100000000 + 1048576 && p[0].color === "#f00");
  const m = t.parseMarkersJson(JSON.stringify({ markers: [{ addr: 4660, label: "Leak" }] }));
  assert(m && m[0].addr === 4660 && m[0].label === "Leak");
});
test("viewer: JSON パーサ異常系", () => {
  assert(t.parseRegionsJson("{ bad json") === null);
  assert(t.parseRegionsJson('{"foo":1}') === null);
  assert(t.parseMarkersJson("null") === null);
});
test("viewer: アドレスパーサ", () => {
  assert(t.parseAddr("0x100000000") === 0x100000000);
  assert(t.parseAddr("0x10_00") === null);
  assert(t.parseAddr("zzz") === null);
  assert(t.parseAddr("0x1,000") === 0x1000);
});
test("viewer: 領域利用量推定", () => {
  const s = global.window.generateSample();
  t.state.regions = s.regions.slice();
  const total = t.estimateAll();
  assert(typeof total === "string");
  const w = t.state.regions.find((r) => r.name === "model.weights");
  const used = t.estimateUsed(w);
  assert(used !== null && used > 0 && used <= 64);
});

/* ---- computeMetricsSync と worker の一致確認 ---- */
test("sync と worker のメトリック一致", () => {
  const buf = new Uint8Array(7000);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 33) % 256;
  for (const metric of ["nonzero", "entropy", "string"]) {
    const a = t.computeMetricsSync(buf, metric);
    const b = evalWorker(buf, 4096, metric);
    assert(a.length === b.length);
    for (let i = 0; i < a.length; i++) assert(Math.abs(a[i] - b[i]) < 1e-6, `${metric}[${i}]`);
  }
});

/* ---- 仕上げ ---- */
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);