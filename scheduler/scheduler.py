"""Backward compatibility shim for legacy entrypoint.

The real implementation now lives in modular files (see main.py).
Keeping this file allows existing Docker CMD or external scripts
that still call `python scheduler.py` to work.
"""
try:
    from .main import start  # package execution
except ImportError:
    # When executed directly as a script (python scheduler/scheduler.py)
    import main  # type: ignore
    start = main.start  # type: ignore

if __name__ == "__main__":  # pragma: no cover
    start()
