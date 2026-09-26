from fastapi import APIRouter

from app.agents.framework import method_catalog

router = APIRouter(prefix="/methods", tags=["methods"])


@router.get("")
def list_methods():
    """The method catalog the frontend renders from.

    Serving it (rather than keeping a second copy in the frontend) is what
    keeps a method's label and description identical in the model's prompt
    and on screen.
    """
    return method_catalog()
