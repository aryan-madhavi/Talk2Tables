# users/__init__.py
from .routes.user_routes import router as users_router

__all__ = ["users_router"]