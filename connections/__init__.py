# connections/__init__.py
from .routes.connection_routes import router as connections_router
from .routes.doc_routes import router as docs_router

__all__ = ["connections_router", "docs_router"]