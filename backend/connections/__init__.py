# connections/__init__.py
from .routes.connection_routes import router as connections_router

__all__ = ["connections_router"]