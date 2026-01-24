"""
SNS Poster Configuration
アカウントID、APIエンドポイント、投稿設定

戦略: 量で攻める。1日3回投稿でバイラル確率を最大化。
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
# Path: .cursor/plans/ios/sns-poster/config.py -> anicca-project
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

# =============================================================================
# API Keys
# =============================================================================
BLOTATO_API_KEY = os.getenv("BLOTATO_API_KEY", "")
FAL_API_KEY = os.getenv("FAL_API_KEY", "")

# =============================================================================
# API Endpoints
# =============================================================================
BLOTATO_BASE_URL = "https://backend.blotato.com/v2"
FAL_BASE_URL = "https://queue.fal.run"

# =============================================================================
# 接続アカウント (Blotato Account IDs)
# 
# 戦略: 量で攻める。メインは1日3回投稿。
# コンテンツ: BIP = Build in Public, MKT = マーケティング
# =============================================================================
ACCOUNTS = {
    # ---------------------------------------------------------------------
    # X (Twitter) - 6回/日
    # ---------------------------------------------------------------------
    "x_xg2grb": {
        "id": "11820",
        "username": "@aniccaxxx",  # 旧@xg2grb
        "platform": "twitter",
        "content": "BIP",  # Build in Public のみ
        "lang": "JP",  # Changed to Japanese
        "frequency": 1,  # 回/日
        "slots": ["20:00"],
    },
    "x_nudges": {
        "id": "11852",
        "username": "@aniccaen",  # 旧@AniccaNudges
        "platform": "twitter",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["20:00"],
    },
    
    # ---------------------------------------------------------------------
    # Instagram - 7回/日
    # ---------------------------------------------------------------------
    "ig_anicca_ai": {
        "id": "28896",
        "username": "@anicca.ai",
        "platform": "instagram",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["19:00"],
    },
    "ig_anicca_japan": {
        "id": "28897",
        "username": "@anicca.japan",
        "platform": "instagram",
        "content": "MKT",
        "lang": "JP",
        "frequency": 1,
        "slots": ["19:00"],
    },
    "ig_anicca_daily": {
        "id": "28682",
        "username": "@anicca.daily",
        "platform": "instagram",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["19:00"],
    },
    
    # ---------------------------------------------------------------------
    # TikTok - 7回/日
    # ---------------------------------------------------------------------
    "tt_anicca_ai": {
        "id": "27339",
        "username": "@anicca.ai",
        "platform": "tiktok",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["19:00"],
    },
    "tt_anicca_japan": {
        "id": "27527",
        "username": "@anicca.japan",
        "platform": "tiktok",
        "content": "MKT",
        "lang": "JP",
        "frequency": 1,
        "slots": ["19:00"],
    },
    "tt_anicca57": {
        "id": "27528",
        "username": "@anicca57",
        "platform": "tiktok",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["20:00"],
    },
    
    # ---------------------------------------------------------------------
    # YouTube - 3回/日
    # ---------------------------------------------------------------------
    "youtube_en": {
        "id": "25421",
        "username": "Daisuke Narita (Anicca - AI Coaching app)",
        "platform": "youtube",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["19:00"],
    },
    "youtube_jp": {
        "id": "25646",
        "username": "@anicca.jp",  # Reviewer Test (Anicca)
        "platform": "youtube",
        "content": "MKT",
        "lang": "JP",
        "frequency": 1,
        "slots": ["19:00"],
    },
    
    # ---------------------------------------------------------------------
    # Threads - 日本語
    # ---------------------------------------------------------------------
    "threads_japan": {
        "id": "4464",
        "username": "@anicca.japan",
        "platform": "threads",
        "content": "MKT",
        "lang": "JP",
        "frequency": 1,
        "slots": ["19:00"],
    },
    
    # ---------------------------------------------------------------------
    # Pinterest - 英語
    # ---------------------------------------------------------------------
    "pinterest": {
        "id": "3965",
        "username": "@aniccaai",
        "platform": "pinterest",
        "board_id": "796996533995957618",
        "content": "MKT",
        "lang": "EN",
        "frequency": 1,
        "slots": ["19:00"],
    },
}

# =============================================================================
# コンテンツタイプ
# =============================================================================
CONTENT_TYPES = {
    "BIP": "Build in Public",  # 開発日記、Day X、MRR報告
    "MKT": "Marketing",        # アプリ紹介、チル動画、仏教系
}

# =============================================================================
# アカウント検索ヘルパー
# =============================================================================
def get_accounts_by_content(content_type: str) -> list:
    """コンテンツタイプでアカウントを取得"""
    return [k for k, v in ACCOUNTS.items() if v.get("content") == content_type]

def get_accounts_by_lang(lang: str) -> list:
    """言語でアカウントを取得"""
    return [k for k, v in ACCOUNTS.items() if v.get("lang") == lang]

def get_accounts_by_platform(platform: str) -> list:
    """プラットフォームでアカウントを取得"""
    return [k for k, v in ACCOUNTS.items() if v.get("platform") == platform]

# =============================================================================
# Default Settings
# =============================================================================
DEFAULT_LINK = "https://anicca.app"
DEFAULT_HASHTAGS = {
    "BIP": "#buildinpublic #indiehacker #startup #ios #swiftui #anicca",
    "MKT": "#anicca #habits #selfimprovement #mindfulness #wellness #buddhism",
}

# =============================================================================
# Generated Files Directory
# =============================================================================
GENERATED_DIR = PROJECT_ROOT / "generated"
IMAGES_DIR = GENERATED_DIR / "images"
VIDEOS_DIR = GENERATED_DIR / "videos"

# Ensure directories exist
IMAGES_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
