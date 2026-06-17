import shutil

from fastapi import HTTPException, status

from backend.core.config import get_settings


def reset_demo_data() -> None:
    settings = get_settings()
    if settings.data_backend != "json":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset de demonstracao disponivel apenas no modo JSON local.",
        )

    seed_path = settings.local_data_file.parent / "local_seed.json"
    if not seed_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Seed local nao encontrado.",
        )

    settings.local_data_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(seed_path, settings.local_data_file)

    if settings.local_storage_dir.exists():
        shutil.rmtree(settings.local_storage_dir)
    settings.local_storage_dir.mkdir(parents=True, exist_ok=True)
