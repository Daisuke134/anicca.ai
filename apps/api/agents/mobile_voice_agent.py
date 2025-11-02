import asyncio
import os
    session = AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice=os.getenv("LIVEKIT_AGENT_VOICE", "alloy"),
            model=os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-mini-realtime-preview"),

    agent = Agent(
        instructions="You are Anicca's Japanese voice coach. Greet the user, keep replies brief, empathetic, and action-oriented."
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(instructions="挨拶し、今の体調と次の予定を簡潔に質問してください。")


def main():
    workers = WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name=os.getenv("LIVEKIT_AGENT_NAME", "mobile-assistant"),
    )
    agents.cli.run_app(workers)


    asyncio.run(main())
