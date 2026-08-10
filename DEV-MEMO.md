# DEV-MEMO.md

====================

## プロジェクト概要

macOS のメモリダンプをブラウザ上で視覚的に掌握するための軽量 Web ツール。
D3.js + Canvas によるヒートマップ可視化と多層表示（領域ハイライト・マーカー）を備える。
GitHub Pages に LP（兼チュートリアル）として公開。

## 主目的（フレーバー）

バックエンドで起動している **LLM / AI 関連プロセス**（llama-server、ollama、python(torch)
など）が消費するメモリを洗い出すこと。モデル重み・KV キャッシュ・アクティベーション・
コンテキストバッファ等の領域をヒートマップで「見える化」し、どこにどれだけメモリが
使われているかを把握する。サンプル生成も LLM プロセス想定の構成にする。

## 前提・方針

- 静的 Web アプリのみ（ネイティブコード不要・ビルド不要・npm 不要）
- 依存は D3.js v7 のみ CDN から1本読み込み（軽量化）
- ダンプ取得はシステムコマンド（lldb/vmmap）で行い、ツールはアップロードされた
  バイナリの可視化に専念
- ヒートマップ描画は SVG rect 大量生成ではなく Canvas で実装（高速・省メモリ）
- メトリック計算は Web Worker で行い UI をブロックしない
- 対象リポジトリ: watanabe3tipapa/dumpdumpdump
- Pages 公開URL: https://watanabe3tipapa.github.io/dumpdumpdump/
- 言語: 日本語

## ファイル構成

| パス | 役割 |
|---|---|
| index.html | LP + チュートリアル（iframe でライブデモ埋め込み） |
| viewer.html | ツール本体 |
| style.css | 共通 CSS（フレームワーク不使用） |
| viewer.js | ツールロジック（レンダリング・レイヤー・UI） |
| worker.js | ページ毎メトリック計算（Web Worker） |
| sample.js | 既知領域を持つ合成サンプル生成（デモ用） |
| scripts/acquire_dump.sh | lldb/vmmap ベースのダンプ取得ヘルパー |
| .nojekyll | Jekyll 無効化 |
| .github/workflows/deploy-pages.yml | Pages デプロイ（Actions） |
| README.md | 使い方 + Actions デプロイ手順 |

## ツール本体の仕様（viewer.html）

### ヒートマップ
- 入力バイナリを 4KB ページに分割
- ページ毎メトリック: 非ゼロ率（デフォルト）/ シャノンエントロピー / 文字密度
- メトリック計算は worker.js に委譲（ArrayBuffer を postMessage）
- Canvas に描画し、ホバーでページ番号・先頭アドレス・値をツールチップ表示
- カラースケール切替（viridis 等）
- ファイル上限（例 256MB）を超えたら警告

### 多層表示
1. ヒートマップ層（Canvas）
2. 領域ハイライト層（SVG・JSON 読込、半透明矩形、pointer-events:none）
3. マーカー層（SVG・クリック追加 + JSON 読込）
- 各層の表示/非表示チェックボックス + 不透明度スライダー

### インタラクション
- d3.zoom によるズーム/パン
- クリックで該当ページの hex/ASCII インスペクタを表示
- アドレス検索で該当セルをハイライト
- サンプル生成ボタン（sample.js）でデモ用データを即時生成

### 領域JSONフォーマット
{"regions":[{"name":"__TEXT","start":4096,"size":8192,"color":"#ff0000"}]}

### マーカーJSONフォーマット
{"markers":[{"addr":4660,"label":"Leak"}]}

## LP + チュートリアル（index.html）

- ヒーロー + CTA（ツールを開く）+ iframe ライブデモ（サンプルデータ表示）
- 機能紹介グリッド
- チュートリアル3ステップ:
  1. scripts/acquire_dump.sh / vmmap で領域確認とダンプ取得
  2. viewer.html に dump.bin + 領域JSON をロード
  3. 非ゼロ率・エントロピーで領域を推定し、層を重ねて解析
- FAQ / セキュリティ注意（ダンプには機密情報が含まれる）

## ダンプ取得ヘルパー（scripts/acquire_dump.sh）

- 書式: sudo ./acquire_dump.sh -p <PID> -a <addr> -s <size> -o dump.bin [-j regions.json]
- lldb の memory read --force --binary でバイナリ取得
- vmmap 出力をパースして regions.json を生成

## GitHub Actions（.github/workflows/deploy-pages.yml）

- main への push / workflow_dispatch で発火
- steps: checkout → configure-pages → upload-pages-artifact(path: .) → deploy-pages
- permissions: id-token: write, pages: write, contents: read
- 公開手順: Pages 設定で「デプロイ元 = GitHub Actions」に変更

## 動作確認手順

1. ローカル: python3 -m http.server 8000 で起動
2. http://localhost:8000 で LP・ツール・サンプル生成を確認
3. git init → commit → watanabe3tipapa/dumpdumpdump へ push
4. GitHub Actions のデプロイ完了後に公開 URL を確認

## 実装手順

1. DEV-MEMO.md 作成（本ファイル）
2. README.md / .nojekyll / .gitignore 作成
3. .github/workflows/deploy-pages.yml 作成
4. style.css 作成
5. worker.js / sample.js 作成
6. viewer.js 作成
7. viewer.html 作成
8. index.html（LP+チュートリアル）作成
9. scripts/acquire_dump.sh 作成
10. ローカルで動作確認
11. git init → commit → push → Actions デプロイ確認

## 作業ログ

- 2026-08-10: 設計・プラン確定。DEV-MEMO.md 作成。
- 2026-08-10: LLM/AI プロセスのメモリ洗い出しを主目的とするフレーバーを追加。
- 2026-08-10: 実装完了。
  - index.html / viewer.html / style.css / viewer.js / worker.js / sample.js
  - scripts/acquire_dump.sh / .github/workflows/deploy-pages.yml / README.md / .nojekyll / .gitignore
- 2026-08-10: 検証実施
  - worker.js のメトリック計算を Node で検証（非ゼロ率 0.996 / エントロピー 0.996 / 期待値と一致）
  - sample.js 生成を検証（126 MiB、8領域・4マーカー、base 0x100000000）
  - viewer.js 統合ハーネスで loadBinary → メトリック計算 → 描画まで一気通貫テスト成功（pages 32256 一致）
  - init() の buildColorLUT 参照バグを検出・修正（buildLUT に統一）
  - bash -n / node --check / ローカル http.server で全リソース 200 確認
- 2026-08-10: git 初期化・コミット・push、GitHub Actions デプロイ確認