from fastapi import APIRouter

from app.providers.registry import health_report

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/health")
async def providers_health():
    return await health_report()
