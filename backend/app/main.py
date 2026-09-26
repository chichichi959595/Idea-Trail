from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import method_runs, providers, sessions
from app.db.models import Base
from app.db.session import engine

app = FastAPI(title="Project Ideation Workbench")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(providers.router)
app.include_router(sessions.router)
app.include_router(method_runs.router)


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"status": "ok"}
