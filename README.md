[![License](https://img.shields.io/github/license/watanabe3tipapa/dumpdumpdump.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/Stack-HTML%2FJS%2FD3-4f8cff)](https://d3js.org)
[![Maintenance](https://img.shields.io/badge/Maintenance-Active-brightgreen.svg)](https://github.com/watanabe3tipapa/dumpdumpdump)
[![Last commit](https://img.shields.io/github/last-commit/watanabe3tipapa/dumpdumpdump/main.svg)](https://github.com/watanabe3tipapa/dumpdumpdump/commits/main)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-3b82f6)](https://watanabe3tipapa.github.io/dumpdumpdump/)

[日本語](README.md) | [English](README_en.md)

# Memory Dump Visualizer

macOS のメモリダンプをブラウザ上で視覚的に把握するための軽量な Web ツールです。
Canvas と D3.js によるヒートマップ表示に、領域ハイライト／マーカーなどの多層表示を重ねられます。GitHub Pages でデモを公開しています。

- Live Demo: https://watanabe3tipapa.github.io/dumpdumpdump/
- ツール本体（Viewer）: https://watanabe3tipapa.github.io/dumpdumpdump/viewer.html

## 概要 / Motivation

バックエンドで稼働している LLM / AI プロセスのメモリ消費を把握する目的で作成されました。
推論プロセスは OS から見ると大きな連続メモリ領域であり、従来の手法だけだと「どの領域がモデル重みか」「KV キャッシュか」を直感的に把握しづらいことがあります。

本ツールはダンプを 4KB ページ単位のヒートマップに変換し、非ゼロ率・エントロピー・文字密度などの指標で領域を特定しやすくすることで、モデル重み／KV キャッシュ／アクティベーション等が実際に何 MiB を使用しているかを推定する手助けをします。

注: 本ツールは「取得後のバイナリを可視化」するためのもので、ダンプの取得自体（lldb / vmmap 等）は別の手段で行ってください。

## 主な機能

- ヒートマップ可視化（ダンプを 4KB ページのグリッドとして一望、Canvas 描画）
- 指標の切替：非ゼロ率 / エントロピー / 文字密度
- 多層表示：領域ハイライトとマーカーを JSON で重ね、各層の表示・不透明度を調整
- 領域ごとの推定使用量（何 MiB 使っているかを自動集計）
- 1980's カセットデッキ調の視覚モード（VU メーター風の LED セグメント等）
- 軽量設計：依存は D3.js の CDN 1 本のみ。ビルド不要 / npm 不要。計算は Web Worker で実行
- hex / ASCII インスペクタ：クリックしたページのバイト列表示、アドレス検索でジャンプ

## スクリーンショット

![Screenshot](assets/screenshot.png)

## ローカルでの動作確認（インストール）

リポジトリをクローンし、簡易 HTTP サーバで配信してブラウザから viewer.html を開きます。

```bash
git clone https://github.com/watanabe3tipapa/dumpdumpdump.git
cd dumpdumpdump
python3 -m http.server 8000   # → http://localhost:8000

# テスト実行（Node のみ・追加依存なし）
node tests/run-tests.mjs
```

## 使い方（Viewer）

1. ブラウザで viewer.html を開く（公開: /dumpdumpdump/viewer.html）
2. バイナリダンプ（dump.bin）をアップロード、または「サンプル生成」でデモデータを作成
3. ホバーでページ情報を確認、クリックで hex／ASCII インスペクタを表示
4. アドレス検索で該当ページへジャンプ
5. 「領域JSON読込」「マーカーJSON読込」で解析レイヤーを重ねる
6. 表示指標や多層の不透明度を調整して解析

## ダンプ取得（macOS の参考手順）

以下はリポジトリ内の手順・スクリプトの利用を想定した例です。ダンプ取得は管理者権限が必要になる場合があります。

```bash
# 対象の LLM / AI プロセスを確認
ps aux | grep -Ei 'llama|ollama|python|torch'

# メモリ領域レイアウトを確認
vmmap <PID>

# lldb でバイナリを取得（例: アドレスとサイズを指定）
sudo lldb -p <PID> \
  -o "memory read --force --binary --outfile dump.bin 0x100000000 0x140000000" \
  -o detach -o quit

# ヘルパースクリプト（バイナリ + regions.json を一度に生成）
sudo ./scripts/acquire_dump.sh -p <PID> -a 0x100000000 -s 0x4000000 \
  -o dump.bin -j regions.json
```

## ドキュメント

詳細な設計・仕様や作業ログは DEV-MEMO.md にまとめています。
また、LP / チュートリアルは GitHub Pages に公開されています: https://watanabe3tipapa.github.io/dumpdumpdump/

## 開発・貢献

貢献歓迎です。一般的なワークフローの例:

1. リポジトリを Fork
2. フィーチャーブランチを作成（例: git checkout -b feature/amazing-feature）
3. 変更をコミット（例: git commit -m 'Add amazing feature'）
4. ブランチを push して Pull Request を作成

リポジトリには tests ディレクトリや簡易スクリプトが含まれていますので、変更時は既存テストの確認を推奨します。

## ライセンス

MIT License — 詳細は LICENSE ファイルを参照してください。

## 連絡先

GitHub: https://github.com/watanabe3tipapa/dumpdumpdump
