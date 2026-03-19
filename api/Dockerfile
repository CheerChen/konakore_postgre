FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code
COPY api/api.py .

# Expose the port the API will run on
EXPOSE 3000

# Run the API with Uvicorn
# --host 0.0.0.0 makes it accessible from outside the container
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "3000"]
