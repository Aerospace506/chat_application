from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.websockets.manager import manager
from app.models.message import Message
from app.routes import chat, groups, auth
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI()

origins = [
    "http://localhost:5173/",
    "https://chat-application-frontend-83ws.onrender.com/"
]
# Allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(chat.router, tags=["chat"])
app.include_router(groups.router)
app.include_router(auth.router) 