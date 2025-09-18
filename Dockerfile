# Use Node.js 18 as base image with Python support
FROM node:18-bullseye

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libfontconfig1 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Install TypeScript globally for build
RUN npm install -g typescript

# Copy Python requirements and install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Build the TypeScript application
RUN npm run build

# Create uploads directory
RUN mkdir -p uploads

# Expose ports (3000 for Node.js, 8000 for Python FastAPI)
EXPOSE 3000 8000

# Create startup script
RUN echo '#!/bin/bash\n\
# Start Python FastAPI service in background\n\
cd /app && python3 -m uvicorn src.services.pdf_service:app --host 0.0.0.0 --port 8000 &\n\
\n\
# Start Node.js application\n\
cd /app && npm run production' > /app/start.sh

RUN chmod +x /app/start.sh

# Use the startup script
CMD ["/app/start.sh"]