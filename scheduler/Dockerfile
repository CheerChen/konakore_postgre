FROM python:3.9-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies using uv
COPY scheduler/pyproject.toml .
RUN uv venv && uv pip install -r pyproject.toml

# Copy the application code preserving package directory
COPY scheduler ./scheduler

# Run the new entrypoint
# Run as module so that package-relative imports always work
CMD [".venv/bin/python", "-m", "scheduler.main"]
