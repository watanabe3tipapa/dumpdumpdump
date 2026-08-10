# Memory Dump Visualizer

macOS のメモリダンプをブラウザ上で視覚的に掌握するための軽量 Web ツール。
D3.js + Canvas によるヒートマップ可視化と、領域ハイライト・マーカーを重ねられる多層表示を備えます。

**主目的**: バックエンドで起動している LLM / AI 関連プロセス（llama-server、ollama、python(torch) など）が消費するメモリを洗い出し、モデル重み・KV キャッシュ・アクティベーション等の領域を「見える化」すること。

- **ツール本体**: https://watanabe3tipapa.github.io/dumpdumpdump/viewer.html
- **LP / チュートリアル**: https://watanabe3tipapa.github.io/dumpdumpdump/

## 特徴

- 静的 Web アプリのみ（ネイティブコード不要・ビルド不要・npm 不要）
- 依存は D3.js v7 の CDN 1 本だけの軽量構成
- メトリック計算は Web Worker で実行（UI をブロックしない）
- ヒートマップ / 領域ハイライト / マーカーの多層表示
- ズーム・パン・アドレス検索・hex/ASCII インスペクタ
- サンプル生成は LLM プロセス想定（モデル重み / KV キャッシュ / アクティベーション / コンテキストバッファ）

## 使い方（ブラウザツール）

1. `viewer.html` を開く
2. バイナリダンプ（`dump.bin`）をアップロード、または「サンプル生成」で LLM プロセス想定のデモ用データを作成
3. ヒートマップが描画されるので、ホバーでページ情報を確認
4. 「領域JSON読込」で `regions.json`（モデル重み / KV キャッシュ等）を重ねる
5. クリックでページの hex/ASCII を検査

### LLM / AI プロセスのダンプ取得（macOS）

```bash
# 対象プロセスを確認（モデルロード済みの LLM サーバ等）
ps aux | grep -Ei 'llama|ollama|python|token|cuda' 

# 領域を確認（対象プロセス PID）
vmmap <PID>

# lldb でバイナリを取得（例: 0x100000000 から 0x1000 バイト）
sudo lldb -p <PID> \
  -o "memory read --force --binary --outfile dump.bin 0x100000000 0x100001000" \
  -o detach -o quit

# ヘルパースクリプトを使う場合（dump.bin + regions.json を一度に生成）
sudo ./scripts/acquire_dump.sh -p <PID> -a 0x100000000 -s 0x10000 \
  -o dump.bin -j regions.json
```

## 開発（ローカル確認）

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## デプロイ（GitHub Pages + Actions）

1. リポジトリ設定 → **Pages** → 「デプロイ元」を **GitHub Actions** に変更
2. `main` に push すると `.github/workflows/deploy-pages.yml` が自動デプロイ
   （`'./'` 直下を公開。`.nojekyll` により Jekyll 処理を無効化）
3. 公開 URL: `https://<ユーザー名>.github.io/dumpdumpdump/`

## セキュリティ注意

メモリダンプには機密情報（パスワード・鍵・個人情報）が含まれる可能性があります。
ダンプファイルはローカルでのみ保持し、公開リポジトリへ push しないでください。
本ツールはブラウザ内でのみ処理し、ファイルを外部へ送信しません。

## ディレクトリ構成

```
├── index.html            # LP + チュートリアル
├── viewer.html           # ツール本体
├── style.css             # 共通 CSS
├── viewer.js             # ツールロジック
├── worker.js             # メトリック計算（Web Worker）
├── sample.js             # 合成サンプル生成
├── scripts/acquire_dump.sh
├── .github/workflows/deploy-pages.yml
└── .nojekyll
```

## 参照

- 設計・仕様・作業ログの詳細: [DEV-MEMO.md](./DEV-MEMO.md)