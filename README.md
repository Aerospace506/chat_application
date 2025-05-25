# Real-time Chat Application

A real-time chat application built with React, FastAPI, and MongoDB.

## Features

- Real-time private messaging between users
- Online/offline status indicators
- Message history persistence
- Clean and modern UI

## Prerequisites

- Python 3.8+
- Node.js 16+
- MongoDB

## Setup

### Backend

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create and activate a virtual environment:

   ```bash
   # Windows
   python -m venv venv
   .\venv\Scripts\activate

   # Linux/Mac
   python -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Usage

1. Make sure MongoDB is running on your system
2. Start the backend server (runs on http://localhost:8000)
3. Start the frontend development server (runs on http://localhost:5173)
4. Open your browser and navigate to http://localhost:5173

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── websockets/
│   │   └── main.py
│   ├── requirements.txt
│   └── venv/
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Chat.jsx
    │   │   └── UserList.jsx
    │   └── App.jsx
    └── package.json
```
