from fastapi import APIRouter, Depends

from backend.core.security import role_required
from backend.schemas.auth import AuthenticatedUser
from backend.schemas.common import MessageResponse
from backend.services.audit import write_audit_log
from backend.services.demo import reset_demo_data


router = APIRouter(prefix="/demo")


@router.post("/reset", response_model=MessageResponse)
def reset_demo(current_user: AuthenticatedUser = Depends(role_required("admin"))):
    reset_demo_data()
    write_audit_log(
        current_user,
        action="demo.reset",
        resource_type="demo",
        metadata={"mode": "json"},
    )
    return MessageResponse(message="Base de demonstracao restaurada.")
