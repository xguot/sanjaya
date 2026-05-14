# Use a slim Python 3.11 base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install basic system tools
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and ALL necessary system dependencies
# This is more robust than hardcoding package names
RUN playwright install chromium
RUN playwright install-deps chromium

# Copy the entire project
COPY . .

# Expose the port (Railway uses PORT env var)
EXPOSE 8000

# Start the application using uvicorn
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
