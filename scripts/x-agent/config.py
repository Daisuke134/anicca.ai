"""
Anicca X Agent Configuration
"""
import os

# API Keys
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
BLOTATO_API_KEY = os.environ.get("BLOTATO_API_KEY", "")

# Backend API
API_BASE_URL = os.environ.get("API_BASE_URL", "").rstrip("/")
API_AUTH_TOKEN = os.environ.get("API_AUTH_TOKEN", "")

# Blotato
BLOTATO_BASE_URL = "https://backend.blotato.com/v2"
# X/Twitter account — uses same Blotato platform but different account
X_ACCOUNT_ID = os.environ.get("X_ACCOUNT_ID", "")

# Agent settings
MODEL = "gpt-4o"
MAX_POSTS_PER_RUN = 3  # max X posts per workflow run

REQUIRED_KEYS = ["OPENAI_API_KEY", "BLOTATO_API_KEY", "API_BASE_URL", "API_AUTH_TOKEN", "X_ACCOUNT_ID"]


def validate_env():
    """Validate required environment variables."""
    missing = [k for k in REQUIRED_KEYS if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")
