import os

from livekit import agents
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions
from livekit.plugins import openai


def build_session() -> AgentSession:
    return AgentSession(
        llm=openai.realtime.RealtimeModel(
            voice=os.getenv("LIVEKIT_AGENT_VOICE", "alloy"),
            model=os.getenv(
                "OPENAI_REALTIME_MODEL",
                "gpt-4o-mini-realtime-preview"
            ),
        )
    )


async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()

    session = build_session()
    agent = Agent(
        instructions=(
            "You are Anicca's Japanese voice coach. "
            "Keep replies brief, empathetic, and action-oriented."
        )
    )

    await session.start(agent=agent, room=ctx.room)
    await session.generate_reply(
        instructions="挨拶し、今の体調と次の予定を簡潔に質問してください。"
    )


if __name__ == "__main__":
    agents.cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name=os.getenv("LIVEKIT_AGENT_NAME", "mobile-assistant"),
        )
    )
