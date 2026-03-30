# connections/core/__init__.py
"""
Core utilities for the connections module.

Exposes:
    encrypt_password  — AES-256-GCM encrypt a plaintext DB password
    decrypt_password  — Decrypt a previously encrypted password
"""
from .encryption import encrypt_password, decrypt_password

__all__ = ["encrypt_password", "decrypt_password"]