# services.audio package
from .voice_guard import AIInterviewerVoiceGuard, SessionVoiceGuardManager

__all__ = ["AudioManager", "AIInterviewerVoiceGuard", "SessionVoiceGuardManager"]

def __getattr__(name: str):
    if name == "AudioManager":
        from .manager import AudioManager
        return AudioManager
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
