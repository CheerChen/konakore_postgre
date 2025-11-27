FROM python:3.9-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install dependencies using uv
COPY file_sync/pyproject.toml .
RUN uv venv && uv pip install -r pyproject.toml

# Copy the application code preserving package directory
COPY file_sync ./file_sync

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Expose port for webhook
EXPOSE 8090

# Run as module so that package-relative imports always work
CMD [".venv/bin/python", "-m", "file_sync.main"]
