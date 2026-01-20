"""
Blotato API Wrapper
SNS投稿を統一的に管理
"""
import requests
from typing import Optional, List, Dict, Any
from config import BLOTATO_API_KEY, BLOTATO_BASE_URL, ACCOUNTS, DEFAULT_LINK


class BlotatoClient:
    """Blotato API Client"""

    def __init__(self, api_key: str = BLOTATO_API_KEY):
        self.api_key = api_key
        self.base_url = BLOTATO_BASE_URL
        self.headers = {
            "blotato-api-key": api_key,
            "Content-Type": "application/json",
        }

    def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make API request"""
        url = f"{self.base_url}{endpoint}"
        response = requests.request(method, url, headers=self.headers, **kwargs)
        response.raise_for_status()
        return response.json()

    # =========================================================================
    # User & Account Management
    # =========================================================================
    def get_user(self) -> Dict[str, Any]:
        """Get current user info"""
        return self._request("GET", "/users/me")

    def list_accounts(self) -> Dict[str, Any]:
        """List all connected accounts (returns dict with 'items' key)"""
        return self._request("GET", "/users/me/accounts")

    def get_pinterest_boards(self) -> List[Dict[str, Any]]:
        """Get Pinterest boards for the connected account"""
        # This may require a specific endpoint - checking via accounts first
        accounts = self.list_accounts()
        for acc in accounts:
            if acc.get("platform") == "pinterest":
                # Return boards if available in account data
                return acc.get("boards", [])
        return []

    # =========================================================================
    # Media Upload
    # =========================================================================
    def upload_media(self, url: str) -> Dict[str, Any]:
        """Upload media from URL"""
        return self._request("POST", "/media", json={"url": url})

    # =========================================================================
    # Post Creation
    # =========================================================================
    def post_to_x(
        self,
        text: str,
        media_urls: Optional[List[str]] = None,
        scheduled_time: Optional[str] = None,
        account: str = "x",  # "x" for @xg2grb (build in public), "x_nudges" for @AniccaNudges
    ) -> Dict[str, Any]:
        """Post to X (Twitter)
        
        Args:
            account: "x" for @xg2grb (Build in Public, English)
                     "x_nudges" for @AniccaNudges (Marketing, Japanese/English)
        """
        account_id = ACCOUNTS.get(account, ACCOUNTS["x"])["id"]
        payload = {
            "post": {
                "accountId": account_id,
                "content": {
                    "text": text,
                    "mediaUrls": media_urls or [],
                    "platform": "twitter",
                },
                "target": {"targetType": "twitter"},
            }
        }
        if scheduled_time:
            payload["scheduledTime"] = scheduled_time
        return self._request("POST", "/posts", json=payload)

    def post_to_instagram(
        self,
        text: str,
        media_urls: List[str],
        media_type: str = "reel",
        scheduled_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Post to Instagram (requires media)"""
        if not media_urls:
            raise ValueError("Instagram requires at least one media URL")

        payload = {
            "post": {
                "accountId": ACCOUNTS["instagram"]["id"],
                "content": {
                    "text": text,
                    "mediaUrls": media_urls,
                    "platform": "instagram",
                },
                "target": {
                    "targetType": "instagram",
                    "mediaType": media_type,  # "reel" or "story"
                },
            }
        }
        if scheduled_time:
            payload["scheduledTime"] = scheduled_time
        return self._request("POST", "/posts", json=payload)

    def post_to_tiktok(
        self,
        text: str,
        media_urls: List[str],
        is_ai_generated: bool = True,
        scheduled_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Post to TikTok (requires media, all params required)"""
        if not media_urls:
            raise ValueError("TikTok requires at least one media URL")

        payload = {
            "post": {
                "accountId": ACCOUNTS["tiktok"]["id"],
                "content": {
                    "text": text,
                    "mediaUrls": media_urls,
                    "platform": "tiktok",
                },
                "target": {
                    "targetType": "tiktok",
                    "privacyLevel": "PUBLIC_TO_EVERYONE",
                    "disabledComments": False,
                    "disabledDuet": False,
                    "disabledStitch": False,
                    "isBrandedContent": False,
                    "isYourBrand": False,
                    "isAiGenerated": is_ai_generated,
                },
            }
        }
        if scheduled_time:
            payload["scheduledTime"] = scheduled_time
        return self._request("POST", "/posts", json=payload)

    def post_to_pinterest(
        self,
        description: str,
        media_urls: List[str],
        title: str,
        board_id: str,
        link: str = DEFAULT_LINK,
        scheduled_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Post to Pinterest (requires media and board_id)"""
        if not media_urls:
            raise ValueError("Pinterest requires at least one media URL")
        if not board_id:
            raise ValueError("Pinterest requires a board_id")

        payload = {
            "post": {
                "accountId": ACCOUNTS["pinterest"]["id"],
                "content": {
                    "text": description,
                    "mediaUrls": media_urls,
                    "platform": "pinterest",
                },
                "target": {
                    "targetType": "pinterest",
                    "boardId": board_id,
                    "title": title,
                    "link": link,
                },
            }
        }
        if scheduled_time:
            payload["scheduledTime"] = scheduled_time
        return self._request("POST", "/posts", json=payload)

    def post_to_youtube(
        self,
        description: str,
        media_urls: List[str],
        title: str,
        privacy_status: str = "public",
        notify_subscribers: bool = True,
        made_for_kids: bool = False,
        scheduled_time: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Post to YouTube (requires video)"""
        if not media_urls:
            raise ValueError("YouTube requires at least one video URL")

        payload = {
            "post": {
                "accountId": ACCOUNTS["youtube"]["id"],
                "content": {
                    "text": description,
                    "mediaUrls": media_urls,
                    "platform": "youtube",
                },
                "target": {
                    "targetType": "youtube",
                    "title": title,
                    "privacyStatus": privacy_status,
                    "shouldNotifySubscribers": notify_subscribers,
                    "isMadeForKids": made_for_kids,
                },
            }
        }
        if scheduled_time:
            payload["scheduledTime"] = scheduled_time
        return self._request("POST", "/posts", json=payload)


# =============================================================================
# Quick Access Functions
# =============================================================================
_client = None


def get_client() -> BlotatoClient:
    """Get singleton client instance"""
    global _client
    if _client is None:
        _client = BlotatoClient()
    return _client


def post_to_x(text: str, media_urls: Optional[List[str]] = None) -> Dict[str, Any]:
    """Quick post to X"""
    return get_client().post_to_x(text, media_urls)


def post_to_instagram(text: str, media_urls: List[str], media_type: str = "reel") -> Dict[str, Any]:
    """Quick post to Instagram"""
    return get_client().post_to_instagram(text, media_urls, media_type)


def post_to_tiktok(text: str, media_urls: List[str]) -> Dict[str, Any]:
    """Quick post to TikTok"""
    return get_client().post_to_tiktok(text, media_urls)


def upload_media(url: str) -> Dict[str, Any]:
    """Quick media upload"""
    return get_client().upload_media(url)


if __name__ == "__main__":
    # Test: List accounts
    client = BlotatoClient()
    print("=== Blotato Accounts ===")
    response = client.list_accounts()
    accounts = response.get("items", [])
    for acc in accounts:
        print(f"- {acc.get('platform', 'unknown')}: {acc.get('id')} ({acc.get('username') or acc.get('fullname', 'N/A')})")

