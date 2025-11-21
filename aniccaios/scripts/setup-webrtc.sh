#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
FRAME_DIR="$ROOT_DIR/aniccaios/Frameworks"
# WebRTC.xcframeworkの取得方法:
# 1. CocoaPods経由: pod 'GoogleWebRTC' を使用
# 2. 手動ダウンロード: https://github.com/stasel/WebRTC/releases から最新版を取得
# 3. または既存のWebRTC.frameworkから変換
PKG_URL="https://github.com/stasel/WebRTC/releases/latest/download/WebRTC.xcframework.zip"
TMP_ZIP="$FRAME_DIR/WebRTC.xcframework.zip"

mkdir -p "$FRAME_DIR"
echo "[1/3] Downloading WebRTC.xcframework ..."
curl -fL "$PKG_URL" -o "$TMP_ZIP"
echo "[2/3] Unzipping ..."
unzip -o "$TMP_ZIP" -d "$FRAME_DIR" >/dev/null
rm -f "$TMP_ZIP"

# 正常性チェック（重要なヘッダが存在すること）
test -f "$FRAME_DIR/WebRTC.xcframework/ios-arm64/WebRTC.framework/Headers/WebRTC.h"
echo "[3/3] OK: WebRTC.xcframework installed at $FRAME_DIR/WebRTC.xcframework"

echo "NEXT: Xcode で Target > Frameworks, Libraries, and Embedded Content に"
echo "      WebRTC.xcframework を追加し Embed & Sign に設定してください。"

