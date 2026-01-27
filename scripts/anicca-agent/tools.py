"""
Anicca TikTok Agent - Tool Definitions
7 tools for the OpenAI function calling agent.
"""
import json
import time
import requests
from config import (
    BLOTATO_API_KEY,
    BLOTATO_BASE_URL,
    FAL_API_KEY,
    FAL_BASE_URL,
    EXA_API_KEY,
    OPENAI_API_KEY,
    TIKTOK_ACCOUNT_ID,
    IMAGE_QUALITY_THRESHOLD,
)
from api_client import AdminAPIClient

api = AdminAPIClient()

# =============================================================================
# OpenAI Tool Definitions (JSON Schema)
# =============================================================================
TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_yesterday_performance",
            "description": "Retrieve yesterday's TikTok post metrics. Returns empty on Day 1.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_hook_candidates",
            "description": "Fetch hook candidates from DB with app and TikTok performance data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 20},
                    "sort_by": {
                        "type": "string",
                        "enum": ["app_tap_rate", "tiktok_like_rate", "exploration_weight"],
                        "default": "app_tap_rate",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_trends",
            "description": "Search current trends via Exa API for content inspiration.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query for trends"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Generate an image via Fal.ai Ideogram v3 (best for text-in-image).",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {"type": "string", "description": "Image generation prompt"},
                    "model": {
                        "type": "string",
                        "enum": ["ideogram", "nano_banana"],
                        "default": "ideogram",
                    },
                },
                "required": ["prompt"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_image",
            "description": "Evaluate image quality using OpenAI Vision. Score 1-10.",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {"type": "string"},
                    "intended_hook": {"type": "string"},
                },
                "required": ["image_url", "intended_hook"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "post_to_tiktok",
            "description": "Post image to TikTok via Blotato API.",
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {"type": "string"},
                    "caption": {"type": "string"},
                    "hashtags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "default": [],
                    },
                },
                "required": ["image_url", "caption"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_post_record",
            "description": "Save the post record to the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hook_candidate_id": {"type": "string"},
                    "blotato_post_id": {"type": "string"},
                    "caption": {"type": "string"},
                    "agent_reasoning": {"type": "string"},
                },
                "required": ["blotato_post_id", "caption"],
            },
        },
    },
]


# =============================================================================
# Tool Implementations
# =============================================================================
def get_yesterday_performance(**kwargs):
    result = api.get_recent_posts(days=1)
    return json.dumps(result)


def get_hook_candidates(**kwargs):
    limit = kwargs.get("limit", 20)
    sort_by = kwargs.get("sort_by", "app_tap_rate")
    result = api.get_hook_candidates(limit=limit, sort_by=sort_by)
    return json.dumps(result)


def search_trends(**kwargs):
    query = kwargs["query"]
    headers = {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "query": query,
        "numResults": 5,
        "useAutoprompt": True,
        "type": "neural",
    }
    try:
        resp = requests.post(
            "https://api.exa.ai/search",
            headers=headers,
            json=payload,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        results = [
            {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("text", "")[:200]}
            for r in data.get("results", [])[:5]
        ]
        return json.dumps({"results": results})
    except Exception as e:
        return json.dumps({"error": str(e), "results": []})


def generate_image(**kwargs):
    prompt = kwargs["prompt"]
    model = kwargs.get("model", "ideogram")

    endpoint_map = {
        "ideogram": "fal-ai/ideogram/v3",
        "nano_banana": "fal-ai/nano-banana-pro",
    }
    endpoint = endpoint_map.get(model, "fal-ai/ideogram/v3")

    headers = {
        "Authorization": f"Key {FAL_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": prompt,
        "aspect_ratio": "9:16",
    }

    # Submit to queue
    resp = requests.post(
        f"{FAL_BASE_URL}/{endpoint}",
        headers=headers,
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    queue_result = resp.json()

    if "request_id" not in queue_result:
        # Direct result
        images = queue_result.get("images", [])
        url = images[0].get("url", "") if images else ""
        return json.dumps({"image_url": url})

    # Poll for completion
    status_url = queue_result.get("status_url", "")
    response_url = queue_result.get("response_url", "")

    for _ in range(60):  # 5 min timeout
        time.sleep(5)
        status_resp = requests.get(status_url, headers=headers, timeout=15)
        status_resp.raise_for_status()
        status = status_resp.json()
        if status.get("status") == "COMPLETED":
            result_resp = requests.get(response_url, headers=headers, timeout=15)
            result_resp.raise_for_status()
            result = result_resp.json()
            images = result.get("images", [])
            url = images[0].get("url", "") if images else ""
            return json.dumps({"image_url": url})
        if status.get("status") == "FAILED":
            return json.dumps({"error": "Image generation failed", "image_url": ""})

    return json.dumps({"error": "Image generation timed out", "image_url": ""})


def evaluate_image(**kwargs):
    image_url = kwargs["image_url"]
    intended_hook = kwargs["intended_hook"]

    from openai import OpenAI
    client = OpenAI(api_key=OPENAI_API_KEY)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a TikTok content evaluator. "
                    "Score the image 1-10 for TikTok engagement potential. "
                    "Check: text readability, visual appeal, hook clarity, 9:16 format. "
                    "Respond ONLY with JSON: {\"quality_score\": N, \"issues\": [...], \"recommendation\": \"post\"|\"regenerate\"|\"skip\"}"
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"Intended hook: \"{intended_hook}\"\nEvaluate this TikTok image:"},
                    {"type": "image_url", "image_url": {"url": image_url}},
                ],
            },
        ],
        max_tokens=300,
    )

    try:
        text = response.choices[0].message.content.strip()
        # Strip markdown code block if present
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        return json.dumps(result)
    except (json.JSONDecodeError, IndexError):
        return json.dumps({"quality_score": 5, "issues": ["Failed to parse evaluation"], "recommendation": "post"})


def post_to_tiktok(**kwargs):
    image_url = kwargs["image_url"]
    caption = kwargs["caption"]
    hashtags = kwargs.get("hashtags", [])

    full_caption = caption
    if hashtags:
        full_caption += "\n\n" + " ".join(f"#{tag.lstrip('#')}" for tag in hashtags)

    # Upload media to Blotato first (handles Fal.ai URL expiration - Spec 11.10)
    headers = {
        "x-api-key": BLOTATO_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "accountId": TIKTOK_ACCOUNT_ID,
        "text": full_caption[:2200],
        "mediaUrls": [image_url],
        "privacyLevel": "PUBLIC_TO_EVERYONE",
        "isAiGenerated": True,
    }

    try:
        resp = requests.post(
            f"{BLOTATO_BASE_URL}/post",
            headers=headers,
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        post_id = data.get("id", data.get("postId", "unknown"))
        return json.dumps({"success": True, "blotato_post_id": str(post_id)})
    except requests.exceptions.HTTPError as e:
        return json.dumps({"success": False, "error": str(e), "blotato_post_id": ""})


def save_post_record(**kwargs):
    result = api.save_post_record(
        blotato_post_id=kwargs["blotato_post_id"],
        caption=kwargs["caption"],
        hook_candidate_id=kwargs.get("hook_candidate_id"),
        agent_reasoning=kwargs.get("agent_reasoning"),
    )
    return json.dumps(result)


# Tool name → function mapping
TOOL_FUNCTIONS = {
    "get_yesterday_performance": get_yesterday_performance,
    "get_hook_candidates": get_hook_candidates,
    "search_trends": search_trends,
    "generate_image": generate_image,
    "evaluate_image": evaluate_image,
    "post_to_tiktok": post_to_tiktok,
    "save_post_record": save_post_record,
}
