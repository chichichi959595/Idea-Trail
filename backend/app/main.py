from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.access import LocalOnlyExceptParticipants
from app.api import (
    convergence,
    library,
    method_runs,
    methods,
    network,
    pain_check,
    providers,
    relay,
    sessions,
)
from app.db.models import Base
from app.db.schema_sync import sync_columns
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    # create_all() won't alter tables that already exist, so backfill any
    # columns added to the models since this database file was created.
    sync_columns(engine)
    yield


app = FastAPI(title="Project Ideation Workbench", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Added last so it runs first: nothing from off this machine gets past it
# except the 多人接龍 participant routes. See app/access.py.
app.add_middleware(LocalOnlyExceptParticipants)

app.include_router(providers.router)
app.include_router(methods.router)
app.include_router(sessions.router)
app.include_router(method_runs.router)
app.include_router(relay.router)
app.include_router(network.router)
app.include_router(library.router)
app.include_router(convergence.router)
app.include_router(pain_check.router)


@app.get("/")
def root():
    return {"status": "ok"}
