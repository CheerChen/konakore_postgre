FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY file_sync/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code preserving package directory
COPY file_sync ./file_sync

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Expose port for webhook
EXPOSE 8090

# Run as module so that package-relative imports always work
CMD ["python", "-m", "file_sync.main"]
