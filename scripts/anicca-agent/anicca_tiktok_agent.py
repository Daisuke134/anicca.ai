"""
Anicca TikTok Agent
Daily autonomous agent that posts to TikTok using OpenAI function calling.

Flow:
1. Review yesterday's performance (get_yesterday_performance)
2. Get hook candidates via Thompson Sampling (get_hook_candidates)
3. Search trends (search_trends) — MANDATORY
4. Select hook + generate image (generate_image)
5. Evaluate image quality (evaluate_image)
6. Post to TikTok (post_to_tiktok)
7. Save record (save_post_record) — MANDATORY, code-enforced

Runs via GitHub Actions: .github/workflows/anicca-daily-post.yml
"""
import json
import sys
from openai import OpenAI
from config import OPENAI_API_KEY, MODEL, MAX_RETRIES
from tools import TOOL_DEFINITIONS, TOOL_FUNCTIONS, save_post_record

client = OpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """You are Anicca's TikTok content agent. You create ONE TikTok post per day.

## MANDATORY WORKFLOW (follow this exact order)

### STEP 1: Review Yesterday
Call get_yesterday_performance.
- If posts exist: note what worked/didn't (like_rate, share_rate)
- If empty (Day 1): proceed to Step 2

### STEP 2: Get Hook Candidates
Call get_hook_candidates with strategy="thompson".
- The API uses Thompson Sampling: 80% exploit (top performers) / 20% explore (new hooks)
- Use the returned hook as your primary content

### STEP 3: Research Trends (MANDATORY)
Call search_trends with a query related to the selected hook's theme.
- Query examples: "self-improvement TikTok 2025", "habit change viral content"
- Use trend insights to enhance your caption and image prompt

### STEP 4: Generate Image
Call generate_image with a detailed prompt.
- Format: 9:16 portrait (TikTok standard)
- Must include readable text overlay with the hook
- Style: emotional, relatable, clean design

### STEP 5: Evaluate Image Quality
Call evaluate_image with the generated image URL and hook text.
- If score < 6 or recommendation is "regenerate": go back to Step 4 (max 2 retries total)
- If score >= 6: proceed to Step 6
- After 2 failed retries: post the best image anyway

### STEP 6: Post to TikTok
Call post_to_tiktok with the image URL and caption.
- Caption: hook text + brief context + hashtags
- Hashtags: #anicca #習慣化 #自己改善 #マインドフルネス #仏教 #行動変容
- Max caption length: 2200 chars

### STEP 7: Save Record (MANDATORY - NEVER SKIP)
Call save_post_record with ALL fields:
- blotato_post_id: from Step 6 result
- caption: the posted caption
- hook_candidate_id: from Step 2 result (the selected hook's id)
- agent_reasoning: 2-3 sentences explaining why you chose this hook and approach

## Target Persona
25-35 years old, struggled with habits for 6-7 years, tried 10+ habit apps and failed.
They feel "I'm a broken person." They're in give-up mode but secretly want to change.

## Content Rules
- Hook must punch in 1-2 seconds (TikTok scroll speed)
- Default language: Japanese (日本語)
- 4 tones: strict, gentle, philosophical, provocative
- If no good hooks exist, create an original one based on the persona

## CRITICAL RULES
- NEVER end without calling save_post_record
- If posting fails, STILL call save_post_record with the error details
- ALWAYS include agent_reasoning
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

    # Tracking variables for forced save_post_record (C-1)
    post_record_saved = False
    last_blotato_post_id = None
    last_caption = None
    last_hook_candidate_id = None

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

            # W-1: Safely parse function arguments
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError as e:
                result = json.dumps({"error": f"Failed to parse arguments: {type(e).__name__}"})
                print(f"  ❌ JSON parse error for {fn_name}: {e}")
                messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": result})
                continue

            print(f"🔧 Tool: {fn_name}({json.dumps(fn_args, ensure_ascii=False)[:100]})")

            fn = TOOL_FUNCTIONS.get(fn_name)
            if fn is None:
                result = json.dumps({"error": f"Unknown tool: {fn_name}"})
            else:
                try:
                    result = fn(**fn_args)
                except Exception as e:
                    result = json.dumps({"error": f"Tool execution failed: {type(e).__name__}"})
                    print(f"  ❌ Error: {e}")

            print(f"  → Result: {result[:200]}")

            # Track state for forced save (C-1, G-1)
            if fn_name == "save_post_record":
                post_record_saved = True
            elif fn_name == "post_to_tiktok":
                try:
                    result_data = json.loads(result)
                    if result_data.get("success"):
                        last_blotato_post_id = result_data.get("blotato_post_id")
                        last_caption = fn_args.get("caption", "")
                except (json.JSONDecodeError, KeyError):
                    pass
            elif fn_name == "get_hook_candidates":
                try:
                    result_data = json.loads(result)
                    selected = result_data.get("selected")
                    if selected:
                        last_hook_candidate_id = selected.get("id")
                    elif result_data.get("candidates"):
                        last_hook_candidate_id = result_data["candidates"][0].get("id")
                except (json.JSONDecodeError, KeyError, IndexError):
                    pass

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })
    else:
        print(f"⚠️ [Anicca Agent] Reached max iterations ({max_iterations})")

    # Forced save_post_record if agent didn't call it (C-1)
    if not post_record_saved:
        if last_blotato_post_id:
            print("⚠️ [Anicca Agent] save_post_record was not called. Forcing save...")
            try:
                forced_result = save_post_record(
                    blotato_post_id=last_blotato_post_id,
                    caption=last_caption or "auto-saved",
                    hook_candidate_id=last_hook_candidate_id or "",
                    agent_reasoning="[FORCED] Agent did not call save_post_record. Auto-saved by safety mechanism.",
                )
                print(f"  → Forced save result: {forced_result}")
            except Exception as e:
                print(f"  ❌ Forced save failed: {e}")
        else:
            print("⚠️ [Anicca Agent] No post was made and no record to save.")

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
