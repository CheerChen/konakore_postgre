FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY scheduler/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code preserving package directory
COPY scheduler ./scheduler

# Run the new entrypoint
# Run as module so that package-relative imports always work
CMD ["python", "-m", "scheduler.main"]
