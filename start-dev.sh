#\!/bin/bash

# Start the backend server
echo "Starting backend server..."
yarn start &
BACKEND_PID=$\!

# Wait for backend to be ready
echo "Waiting for backend to start..."
sleep 5

# Start the frontend dev server
echo "Starting frontend dev server..."
yarn dev

# When frontend exits, kill backend
kill $BACKEND_PID
EOF < /dev/null
