#!/usr/bin/env python3
from fal_ai import FalAIClient
import requests

client = FalAIClient()

# English image
prompt_en = """Viral TikTok Instagram carousel slide, 9:16 vertical aspect ratio, pure black background, white text.

Clean minimal to-do list:

Day 23 of building Anicca
2026/1/25
MRR: $18

☐ LLM now generates nudge content
☐ Single screen redesign
☐ Hard paywall + monthly + 1wk trial
☐ Landing page redesign
☐ Posted JP/EN content
☐ Final thesis revision (deadline: 29th)

#buildinpublic

Modern clean typography, high contrast, monochrome Buddhist minimalism."""

print("Generating English image...")
result = client.generate_image_nano_banana(prompt_en, aspect_ratio='9:16')
en_url = result.get('images', [{}])[0].get('url', '')
print(f'EN_URL: {en_url}')

# Japanese image
prompt_jp = """Viral TikTok Instagram carousel slide, 9:16 vertical aspect ratio, pure black background, white text.

Clean minimal to-do list in Japanese:

Anicca開発23日目
2026/1/25
MRR: $18

☐ LLMがナッジを生成するように
☐ シングルスクリーン化
☐ ハードPaywall + 月額 + 1週間トライアル
☐ LPリデザイン
☐ 日英コンテンツ投稿
☐ 修論最終稿（〆切: 29日）

#buildinpublic

Modern clean typography, high contrast, monochrome Buddhist minimalism."""

print("Generating Japanese image...")
result_jp = client.generate_image_nano_banana(prompt_jp, aspect_ratio='9:16')
jp_url = result_jp.get('images', [{}])[0].get('url', '')
print(f'JP_URL: {jp_url}')

print(f"\n=== RESULTS ===")
print(f"EN: {en_url}")
print(f"JP: {jp_url}")

