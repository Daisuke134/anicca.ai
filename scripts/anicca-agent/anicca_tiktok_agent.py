"""
Anicca TikTok Agent
Daily autonomous agent that posts to TikTok using OpenAI function calling.

Flow:
1. Review yesterday's performance (get_yesterday_performance)
2. Get hook candidates (get_hook_candidates)
3. Optionally search trends (search_trends)
4. Select hook + generate image (generate_image)
5. Evaluate image quality (evaluate_image)
6. Post to TikTok (post_to_tiktok)
7. Save record (save_post_record)

Runs via GitHub Actions: .github/workflows/anicca-daily-post.yml
"""
import json
import sys
from openai import OpenAI
from config import OPENAI_API_KEY, MODEL, MAX_RETRIES
from tools import TOOL_DEFINITIONS, TOOL_FUNCTIONS

client = OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """You are Anicca's TikTok content agent. Your job is to create ONE TikTok post per day that reduces human suffering through Buddhist-informed behavioral science.

## Target Persona
25-35 years old, struggled with habits for 6-7 years, tried 10+ habit apps and failed. They feel "I'm a broken person." They're in give-up mode but secretly want to change.

## Your Daily Process
1. Call get_yesterday_performance to review metrics (empty on Day 1 = normal)
2. Call get_hook_candidates to see available hooks with performance data
3. Optionally call search_trends for current content inspiration
4. Select the best hook using Thompson Sampling logic:
   - 80% EXPLOIT: Pick from top performers (highest app_tap_rate or tiktok_like_rate)
   - 20% EXPLORE: Pick a less-tested hook (high exploration_weight)
5. Generate an image with generate_image using the selected hook text
6. Evaluate with evaluate_image. If score < 6, regenerate (max 2 retries)
7. Post with post_to_tiktok
8. Save record with save_post_record (include your reasoning)

## Content Guidelines
- Hook must punch in 1-2 seconds (TikTok scroll speed)
- Use Japanese for JP audience, English for EN (default: Japanese)
- 4 tones: strict, warm, philosophical, provocative
- Image must have readable text overlay (9:16 portrait)
- Caption: hook + brief context + hashtags
- Hashtags: #anicca #習慣化 #自己改善 #マインドフルネス #仏教 #行動変容

## Rules
- ALWAYS call save_post_record at the end (even if posting fails, record the attempt)
- Include agent_reasoning explaining why you chose this hook and approach
- If no good hooks exist, create an original one based on the persona
- If image quality is poor after retries, post the best one anyway (content > perfection)
"""

def run_agent():
    print("🤖 [Anicca Agent] Starting daily TikTok post generation")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append({
        "role": "user",
        "content": "Execute your daily TikTok posting process. Review performance, select a hook, generate content, and post.",
    })

    max_iterations = 15
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n--- Iteration {iteration}/{max_iterations} ---")

        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=TOOL_DEFINITIONS,
            tool_choice="auto",
        )

        choice = response.choices[0]
        message = choice.message

        # Append assistant message
        messages.append(message.model_dump())

        # Check if done (no tool calls)
        if choice.finish_reason == "stop" or not message.tool_calls:
            print(f"\n✅ [Anicca Agent] Completed. Final message:")
            print(message.content or "(no text)")
            break

        # Execute tool calls
        for tool_call in message.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)

            print(f"🔧 Tool: {fn_name}({json.dumps(fn_args, ensure_ascii=False)[:100]})")

            fn = TOOL_FUNCTIONS.get(fn_name)
            if fn is None:
                result = json.dumps({"error": f"Unknown tool: {fn_name}"})
            else:
                try:
                    result = fn(**fn_args)
                except Exception as e:
                    result = json.dumps({"error": str(e)})
                    print(f"  ❌ Error: {e}")

            print(f"  → Result: {result[:200]}")

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })
    else:
        print(f"⚠️ [Anicca Agent] Reached max iterations ({max_iterations})")

    print("\n🏁 [Anicca Agent] Done")


if __name__ == "__main__":
    if not OPENAI_API_KEY:
        print("❌ OPENAI_API_KEY not set")
        sys.exit(1)

    try:
        run_agent()
    except Exception as e:
        print(f"❌ [Anicca Agent] Fatal error: {e}")
        sys.exit(1)
