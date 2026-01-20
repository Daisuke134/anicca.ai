"""
SNS Poster Configuration
アカウントID、APIエンドポイント、投稿設定
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
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
# =============================================================================
ACCOUNTS = {
    "youtube": {
        "id": "25421",
        "username": "Daisuke Narita (Anicca - AI Coaching app)",
        "platform": "youtube",
    },
    "instagram": {
        "id": "28682",
        "username": "@anicca.daily",
        "platform": "instagram",
    },
    "pinterest": {
        "id": "3965",
        "username": "@aniccaai",
        "platform": "pinterest",
        "board_id": "796996533995957618",  # Anicca board
    },
    "tiktok": {
        "id": "27339",
        "username": "@anicca.ai",
        "platform": "tiktok",
    },
    "x": {
        "id": "11820",
        "username": "@xg2grb",
        "platform": "twitter",
        "content_focus": "build_in_public",  # English only
        "language": "en",
    },
    "x_nudges": {
        "id": "11852",
        "username": "@AniccaNudges",
        "platform": "twitter",
        "content_focus": "marketing",  # Everything except build in public
        "language": "ja_en",  # Japanese and English
    },
}

# =============================================================================
# 投稿戦略
# =============================================================================
POSTING_STRATEGY = {
    "x": {
        "content_types": ["build_in_public"],
        "frequency": 3,  # per day
        "language": "en",  # + 時々日本語
    },
    "instagram": {
        "content_types": ["marketing", "build_in_public"],
        "frequency": 1,  # per day (1回/日のみ)
        "language": "en",
    },
    "tiktok": {
        "content_types": ["marketing", "build_in_public"],
        "frequency": 3,
        "language": "en",
    },
    "pinterest": {
        "content_types": ["marketing", "build_in_public"],
        "frequency": 3,
        "language": "en",
    },
    "youtube": {
        "content_types": ["marketing", "build_in_public"],
        "frequency": 3,
        "language": "en",  # + 時々日本語
    },
}

# =============================================================================
# Default Settings
# =============================================================================
DEFAULT_LINK = "https://anicca.app"
DEFAULT_HASHTAGS = {
    "build_in_public": "#buildinpublic #indiehacker #startup #ios #swiftui",
    "marketing": "#anicca #habits #selfimprovement #mindfulness #wellness",
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

