"use strict";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MB = 1024 * 1024;
const BASE = 0x100000000;

function generateSample() {
  const rng = mulberry32(0x5EED);

  const sections = [
    { name: "__TEXT", size: 2 * MB, color: "#4f8cff", kind: "code" },
    { name: "vocab/strings", size: 8 * MB, color: "#34d399", kind: "strings" },
    { name: "model.weights", size: 64 * MB, color: "#fbbf24", kind: "dense" },
    { name: "kv_cache", size: 16 * MB, color: "#f87171", kind: "sparse60" },
    { name: "activations", size: 8 * MB, color: "#a78bfa", kind: "dense" },
    { name: "context_buffer", size: 8 * MB, color: "#22d3ee", kind: "sparse15" },
    { name: "heap", size: 16 * MB, color: "#f472b6", kind: "sparse45" },
    { name: "stack", size: 4 * MB, color: "#fb923c", kind: "sparse85" },
  ];

  const total = sections.reduce((acc, s) => acc + s.size, 0);
  const bytes = new Uint8Array(total);
  const regions = [];
  let off = 0;

  for (const s of sections) {
    for (let i = 0; i < s.size; i++) {
      const r = rng();
      let b;
      switch (s.kind) {
        case "code":
          b = (rng() * 256) | 0;
          break;
        case "strings":
          b = r < 0.5 ? 32 + ((rng() * 95) | 0) : r < 0.75 ? 0 : (rng() * 256) | 0;
          break;
        case "dense":
          b = r < 0.02 ? 0 : (rng() * 256) | 0;
          break;
        case "sparse60":
          b = r < 0.35 ? 0 : (rng() * 256) | 0;
          break;
        case "sparse15":
          b = r < 0.85 ? 0 : (rng() * 256) | 0;
          break;
        case "sparse45":
          b = r < 0.55 ? 0 : (rng() * 256) | 0;
          break;
        default:
          b = r < 0.15 ? 0 : (rng() * 256) | 0;
      }
      bytes[off + i] = b;
    }
    regions.push({
      name: s.name,
      start: BASE + off,
      size: s.size,
      end: BASE + off + s.size,
      color: s.color,
    });
    off += s.size;
  }

  const markers = [
    { addr: BASE + 2 * MB, label: "Tokenizer vocab" },
    { addr: BASE + 10 * MB, label: "モデル重み (FP16)" },
    { addr: BASE + 74 * MB, label: "KV キャッシュ" },
    { addr: BASE + 90 * MB, label: "Activation peak" },
  ];

  return { bytes, total, regions, markers, base: BASE };
}

window.generateSample = generateSample;