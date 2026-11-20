#!/bin/bash
# Run the MyLaps Ingestor script (UDP or Simulator)

# Clear screen
clear

# Show header
echo "====================================="
echo "  MyLaps Ingestor Launcher"
echo "====================================="
echo

# Check if Python and required packages are installed
echo "Checking dependencies..."
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed! Please install Python 3."
    exit 1
fi

# Try to install required packages if not present
echo "Installing required packages if needed..."
python3 -m pip install redis>=5.0.0 python-dotenv

# Run the script
echo
echo "====================================="
echo "Starting MyLaps Ingestor..."
echo "====================================="
echo

# Check if we're running in simulator mode
if grep -q "USE_SIMULATOR=true" .env 2>/dev/null; then
    echo "🔄 Running in SIMULATOR mode"
else
    echo "📡 Running in UDP mode"
fi

echo
python3 main.py

# Script will continue running until manually stopped
