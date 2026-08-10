"use strict";

let globalPageSize = 4096;

function computeSinglePage(data, start, end, metric) {
  const n = end - start;
  if (metric === "nonzero") {
    let nz = 0;
    for (let j = start; j < end; j++) if (data[j] !== 0) nz++;
    return nz / n;
  }
  if (metric === "string") {
    let p = 0;
    for (let j = start; j < end; j++) {
      const b = data[j];
      if (b === 9 || (b >= 32 && b < 127)) p++;
    }
    return p / n;
  }
  let hist = new Uint32Array(256);
  for (let j = start; j < end; j++) hist[data[j]]++;
  let ent = 0;
  for (let k = 0; k < 256; k++) {
    if (!hist[k]) continue;
    const p = hist[k] / n;
    ent -= p * Math.log2(p);
  }
  return ent / 8;
}

function computeAll(data, pageSize, metric) {
  const pages = Math.ceil(data.length / pageSize);
  const out = new Float32Array(pages);
  for (let i = 0; i < pages; i++) {
    const start = i * pageSize;
    out[i] = computeSinglePage(data, start, Math.min(start + pageSize, data.length), metric);
  }
  return out;
}

self.onmessage = (ev) => {
  const { id, buffer, pageSize, metric } = ev.data;
  if (pageSize) globalPageSize = pageSize;
  const data = new Uint8Array(buffer);
  const values = computeAll(data, globalPageSize, metric);
  self.postMessage({ id, values: values.buffer, length: values.length }, [values.buffer]);
};