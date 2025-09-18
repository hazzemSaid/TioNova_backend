#!/bin/bash

echo "🚀 Starting TioNova Backend Services..."

# Function to handle shutdown
shutdown() {
    echo "📴 Shutting down services..."
    kill $(jobs -p)
    exit 0
}

# Trap SIGTERM and SIGINT
trap shutdown SIGTERM SIGINT

# Start Python FastAPI service in background
echo "🐍 Starting Python FastAPI service on port 8000..."
python3 -m uvicorn src.services.pdf_service:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!

# Wait a moment for Python service to start
sleep 3

# Start Node.js application
echo "🟢 Starting Node.js application on port $PORT..."
npm run production &
NODE_PID=$!

# Wait for any process to exit
wait $NODE_PID $PYTHON_PID