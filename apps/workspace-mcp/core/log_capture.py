import io
import logging
from contextlib import contextmanager
from typing import Iterable


@contextmanager
def capture_logs(logger_names: Iterable[str], level: int = logging.INFO):
    """Capture logs from the given logger names into a memory buffer.

    Returns a callable that retrieves the captured text.
    """
    buffer = io.StringIO()
    handler = logging.StreamHandler(buffer)
    handler.setLevel(level)

    attached = []
    for name in logger_names:
        lg = logging.getLogger(name)
        prev_level = lg.level
        # Ensure level is at least the capture level
        if not prev_level or prev_level > level:
            lg.setLevel(level)
        lg.addHandler(handler)
        attached.append((lg, prev_level))

    try:
        yield lambda: buffer.getvalue()
    finally:
        for lg, prev_level in attached:
            try:
                lg.removeHandler(handler)
                if prev_level:
                    lg.setLevel(prev_level)
            except Exception:
                pass
        handler.close()

