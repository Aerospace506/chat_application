import subprocess
import sys
import os
from pathlib import Path

def setup():
    # Create virtual environment if it doesn't exist
    venv_path = Path("venv")
    if not venv_path.exists():
        print("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
    
    # Determine the pip path based on the operating system
    if os.name == "nt":  # Windows
        pip_path = venv_path / "Scripts" / "pip"
    else:  # Unix-like
        pip_path = venv_path / "bin" / "pip"
    
    # Upgrade pip
    print("Upgrading pip...")
    subprocess.run([str(pip_path), "install", "--upgrade", "pip"], check=True)
    
    # Install requirements
    print("Installing requirements...")
    subprocess.run([str(pip_path), "install", "-r", "requirements.txt"], check=True)
    
    print("\nSetup completed successfully!")
    print("\nTo run the server:")
    print("1. Activate the virtual environment:")
    if os.name == "nt":  # Windows
        print("   .\\venv\\Scripts\\activate")
    else:  # Unix-like
        print("   source venv/bin/activate")
    print("2. Run the server:")
    print("   python run.py")

if __name__ == "__main__":
    setup() 