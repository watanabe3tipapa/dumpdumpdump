#!/usr/bin/env bash
#
# acquire_dump.sh — macOS の LLM / AI プロセス向けメモリダンプ取得ヘルパー
#
# 対象プロセスの指定アドレス範囲を lldb (memory read) でバイナリとして書き出し、
# オプションで vmmap 出力をパースして regions.json も生成します。
#
# 使い方:
#   sudo ./scripts/acquire_dump.sh -p <PID> -a 0x100000000 -s 0x10000 \
#       -o dump.bin [-j regions.json]
#
# 注意:
#   1) 他プロセスのメモリを読むには root (sudo) が必要です。
#   2) ダンプには機密情報が含まれる可能性があります。外部へ共有しないでください。
set -euo pipefail

PID=""
ADDR=""
SIZE=""
OUT=""
JSON=""

usage() {
  cat <<EOF
使い方: sudo $0 -p <PID> -a <start addr> -s <size bytes> -o <out.bin> [-j regions.json]

  -p PID          対象プロセス ID
  -a ADDR         読み取り開始仮想アドレス (0x...)
  -s SIZE         読み取りバイト数 (0x... または 10進)
  -o FILE         書き出し先バイナリファイル
  -j FILE         任意: regions.json (vmmap から生成)
  -h              このヘルプ
EOF
  exit ${1:-1}
}

while getopts "p:a:s:o:j:h" opt; do
  case "$opt" in
    p) PID="$OPTARG" ;;
    a) ADDR="$OPTARG" ;;
    s) SIZE="$OPTARG" ;;
    o) OUT="$OPTARG" ;;
    j) JSON="$OPTARG" ;;
    h) usage 0 ;;
    *) usage ;;
  esac
done

if [[ -z "$PID" || -z "$ADDR" || -z "$SIZE" || -z "$OUT" ]]; then
  echo "エラー: 必須オプション不足 (-p / -a / -s / -o)" >&2
  usage
fi

# 10進/16進を統一し、0x プレフィクスは取り除いて bash 演算する
START="$ADDR"
ADDR_HEX="${ADDR#0x}"
END=""
if echo "$SIZE" | grep -qi '^0x'; then
  END="$(printf '0x%x' "$(( 16#$ADDR_HEX + 16#${SIZE#0x} ))")"
else
  END="$(printf '0x%x' "$(( 16#$ADDR_HEX + SIZE ))")"
fi

# 対象プロセスが存在するか
if ! kill -0 "$PID" 2>/dev/null; then
  echo "エラー: PID $PID が見つかりません" >&2
  exit 1
fi

echo "==> 対象 PID: $PID"
echo "==> 範囲: $START - $END ($SIZE bytes)"
echo "==> 出力: $OUT"

LLDB_SCRIPT=$(mktemp)
trap 'rm -f "$LLDB_SCRIPT"' EXIT
cat >"$LLDB_SCRIPT" <<EOF
process attach --pid $PID
memory read --force --binary --outfile $OUT $START $END
detach
quit
EOF

echo "==> lldb 実行中 …"
if ! lldb -s "$LLDB_SCRIPT" >/dev/null 2>&1; then
  echo "エラー: メモリ読み取りに失敗しました (root? SIP?)" >&2
  exit 1
fi

if [[ ! -s "$OUT" ]]; then
  echo "エラー: 出力ファイルが空です" >&2
  exit 1
fi

ls -lh "$OUT"

# --- regions.json 生成 (vmmap) ---
if [[ -n "$JSON" ]]; then
  echo "==> vmmap から regions.json を生成中 …"
  VMMAP=$(mktemp)
  trap 'rm -f "$LLDB_SCRIPT" "$VMMAP"' EXIT
  vmmap -w "$PID" >"$VMMAP" 2>/dev/null || { echo "エラー: vmmap 失敗" >&2; exit 1; }

  python3 - "$VMMAP" "$JSON" <<'PY'
import json, re, sys

vmfile, outfile = sys.argv[1], sys.argv[2]
regions = []
pat = re.compile(r"^\s*([0-9a-f]{1,16})-([0-9a-f]{1,16})\s+\[+([^]]*)\]\s+([r-][w-][x-]/[r-][w-][x-])")
with open(vmfile, "r", errors="replace") as f:
    for line in f:
        m = pat.match(line)
        if not m:
            continue
        start_s, end_s, kind, perm = m.groups()
        try:
            start = int(start_s, 16)
            end = int(end_s, 16)
        except ValueError:
            continue
        regions.append({
            "name": kind.strip() or "region",
            "start": start,
            "size": end - start,
            "perm": perm,
            "color": "#4f8cff" if perm.startswith("r") else "#f87171",
        })
with open(outfile, "w") as f:
    json.dump({"regions": regions}, f, indent=2)
print(f"==> {len(regions)} 件の領域を {outfile} に書き出しました")
PY
fi

echo "==> 完了"