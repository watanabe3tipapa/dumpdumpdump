<!-- badges -->
[![License](https://img.shields.io/github/license/watanabe3tipapa/dumpdumpdump.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/Stack-HTML%2FJS%2FD3-4f8cff)](https://d3js.org)
[![Maintenance](https://img.shields.io/badge/Maintenance-Active-brightgreen.svg)](https://github.com/watanabe3tipapa/dumpdumpdump)
[![Last commit](https://img.shields.io/github/last-commit/watanabe3tipapa/dumpdumpdump/main.svg)](https://github.com/watanabe3tipapa/dumpdumpdump/commits/main)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-3b82f6)](https://watanabe3tipapa.github.io/dumpdumpdump/)

[日本語](README.md) | [English](README_en.md)

# Memory Dump Visualizer

A lightweight web tool to visually grasp macOS memory dumps in the browser.
It renders a heat-map with Canvas + D3.js and supports layered views
(region highlights / markers), published on GitHub Pages.

- **Live Demo**: https://watanabe3tipapa.github.io/dumpdumpdump/
- **Tool**: https://watanabe3tipapa.github.io/dumpdumpdump/viewer.html

## Motivation

I built this tool to **identify how much memory is consumed by LLM / AI processes**
running in the backend. Inference processes such as `llama-server`, `ollama` and
`python(torch)` look like one huge memory blob to the OS; it is hard to tell where
the model weights end and where the KV cache begins with conventional tools.
This tool converts a dump into a 4 KB page-level heat-map and lets you isolate
regions using non-zero ratio, entropy and string density, while estimating how many
MiB each region (weights, KV cache, activations, ...) actually occupies.

> Note: this tool visualizes *dumps you have already captured*; acquisition itself is
> the job of `lldb` / `vmmap`. Dumps may contain sensitive data — keep them local.

## Features

- **Heat-map** — the whole dump at a glance as a 4 KB page grid (Canvas)
- **Metrics** — non-zero ratio / Shannon entropy / string density
- **Layered view** — region highlights and markers overlaid from JSON, per-layer visibility & opacity
- **Usage estimation** — how many MiB each region actually uses
- **1980's cassette-deck look** — VU-meter style LED segments, tape counter, peak hold
- **Lightweight** — only D3.js from a CDN; no build, no npm. Metrics run in a Web Worker
- **Hex/ASCII inspector** — click a page to inspect its bytes; search by address to jump

## Screenshot

![Screenshot](assets/screenshot.png)

## Installation (local)

```bash
git clone https://github.com/watanabe3tipapa/dumpdumpdump.git
cd dumpdumpdump
python3 -m http.server 8000   # → http://localhost:8000

# run tests (Node only, no dependencies)
node tests/run-tests.mjs
```

## Usage

1. Open `viewer.html` in a browser (published at `/dumpdumpdump/viewer.html`)
2. Upload a binary dump (`dump.bin`) or click **sample generation** for LLM-process-like demo data
3. Hover for page info, click for hex/ASCII inspection, search by address to jump
4. Load region / marker JSON to overlay analysis layers
5. Switch to **1980's cassette-deck mode** for a VU-meter look

### Capturing a dump (macOS)

```bash
# find the target LLM / AI process
ps aux | grep -Ei 'llama|ollama|python|torch'

# inspect memory layout
vmmap <PID>

# read memory with lldb (e.g. 0x100000000 .. 0x140000000)
sudo lldb -p <PID> \
  -o "memory read --force --binary --outfile dump.bin 0x100000000 0x140000000" \
  -o detach -o quit

# helper script (binary + regions.json in one shot)
sudo ./scripts/acquire_dump.sh -p <PID> -a 0x100000000 -s 0x4000000 \
  -o dump.bin -j regions.json
```

## Documentation

See [DEV-MEMO.md](DEV-MEMO.md) for design, specs and the work log.
The LP / tutorial is live at https://watanabe3tipapa.github.io/dumpdumpdump/.

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a [Pull Request](https://github.com/watanabe3tipapa/dumpdumpdump/pulls)

## License

MIT License — see the [LICENSE](LICENSE) file for details.

## Contact

GitHub: [https://github.com/watanabe3tipapa/dumpdumpdump](https://github.com/watanabe3tipapa/dumpdumpdump)
