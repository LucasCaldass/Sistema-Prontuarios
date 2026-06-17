from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.core.config import get_settings
from backend.core.errors import register_error_handlers
from backend.routes import (
    appointments,
    attachments,
    audit,
    auth,
    demo,
    health,
    medications,
    patients,
    prescriptions,
    records,
    reports,
    users,
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="Sistema de Prontuarios API",
        version="0.1.0",
        description="API para gestao de pacientes, prontuarios, prescricoes, consultas e anexos clinicos.",
    )

    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    app.include_router(health.router, tags=["health"])
    app.include_router(auth.router, tags=["auth"])
    app.include_router(patients.router, tags=["patients"])
    app.include_router(records.router, tags=["medical-records"])
    app.include_router(prescriptions.router, tags=["prescriptions"])
    app.include_router(medications.router, tags=["medications"])
    app.include_router(appointments.router, tags=["appointments"])
    app.include_router(attachments.router, tags=["attachments"])
    app.include_router(users.router, tags=["users"])
    app.include_router(reports.router, tags=["reports"])
    app.include_router(audit.router, tags=["audit"])
    app.include_router(demo.router, tags=["demo"])

    if settings.data_backend == "json":
        settings.local_storage_dir.mkdir(parents=True, exist_ok=True)
        app.mount(
            "/local-storage",
            StaticFiles(directory=settings.local_storage_dir),
            name="local-storage",
        )

    return app


app = create_app()
