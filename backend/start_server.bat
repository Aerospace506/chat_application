@echo off
echo Setting up the environment...
python setup.py

echo.
echo Activating virtual environment...
call .\venv\Scripts\activate

echo.
echo Starting the server...
python run.py 