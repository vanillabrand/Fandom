# Dockerfile for Fandom Velocity Scraper (Python)
FROM apify/actor-python:3.11

USER root
RUN apt-get update && apt-get install -y \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

USER apify

# Install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . ./

# Run the actor
CMD ["python3", "main.py"]
