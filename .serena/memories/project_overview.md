# Anicca プロジェクト概要

## Aniccaとは
行動変容をサポートするiOSアプリ。AIを活用したプロアクティブな通知（Nudge）で、ユーザーの「苦しみ」に寄り添う。

## ターゲットユーザー
6-7年間習慣化に失敗し続けている25-35歳。習慣アプリ10個以上試して全部3日坊主。「自分はダメ」と信じ込んでいるが、心の奥では変わりたい。

## 技術スタック
- **iOS**: Swift, SwiftUI (iOS 15+, Xcode 16+)
- **API**: Node.js + Express (Railway)
- **DB**: Railway PostgreSQL + Prisma ORM
- **決済**: RevenueCat + Superwall ($9.99/月, 1週間無料トライアル)
- **分析**: Mixpanel
- **AI**: OpenAI (Commander agent, 構造化出力でNudge生成)
- **E2Eテスト**: Maestro
- **VPS Agent**: OpenClaw (GPT-4o, Slack連携, メトリクスレポート)

## リポジトリ構成
- `aniccaios/` — iOSアプリ本体
- `apps/api/` — APIサーバー（Railway）
- `apps/landing/` — ランディングページ（Netlify）
- `daily-apps/` — 関連アプリ（Daily Dhamma等）
- `.cursor/plans/` — 仕様書・計画
- `.kiro/` — ステアリング・スペック
- `.claude/` — Claude Code設定・ルール・スキル
- `.serena/memories/` — Serenaメモリ（プロジェクト知識ベース）

## 現在のバージョン
iOS 1.6.2 (2026年2月)

## 削除済み機能（歴史的経緯）
- デスクトップアプリ (Electron) — 削除
- 音声AI機能 (OpenAI Realtime, ElevenLabs) — 削除
- Webアプリ (Next.js) — 削除
- Composio MCP統合 — 削除
- Singular/ATT トラッキング — 削除