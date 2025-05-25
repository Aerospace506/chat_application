import uvicorn
import os
import sys

# Add the current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(current_dir)

if __name__ == "__main__":
    # Start the server
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=10000,
        reload=True
    ) 