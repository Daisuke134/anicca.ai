import logging
import os

from dotenv import load_dotenv
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.agents.voice import Agent, AgentSession
from livekit.agents.voice.room_io import RoomOutputOptions
load_dotenv()

logger = logging.getLogger("mobile-voice-agent")
logger.setLevel(logging.INFO)
GREETING = os.getenv("LIVEKIT_AGENT_GREETING", "おはようございます、今日の予定を一緒に確認しましょう。")
INSTRUCTIONS = os.getenv(
    "LIVEKIT_AGENT_INSTRUCTIONS",
    "You are Anicca, a Japanese voice coach. Keep replies concise, empathetic, and helpful.",
)


async def entrypoint(ctx: JobContext) -> None:
    session = AgentSession()
    await session.start(
        ),
    )


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
