# connections/core/encryption.py
"""
AES-256-GCM encryption for sensitive data at rest.

The encryption key is loaded from the environment variable:
    DB_ENCRYPTION_KEY  — 32-byte (256-bit) hex string

Generate a key:
    python -c "import secrets; print(secrets.token_hex(32))"

Add to .env:
    DB_ENCRYPTION_KEY=<output from above>

Why AES-256-GCM:
  • Authenticated encryption — detects tampering (integrity + confidentiality)
  • Each encryption uses a fresh random 12-byte nonce — same plaintext never
    produces the same ciphertext twice
  • Industry standard for secrets at rest

Storage format (base64url-encoded):
    <12-byte nonce> + <ciphertext> + <16-byte auth tag>
    All concatenated then base64url-encoded into a single string.

Usage:
  • encrypt_password() — legacy API for DB connection passwords
  • encrypt_field() — generic field encryption for user data
  • decrypt_field() — generic decryption for user data
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# ── Load key ──────────────────────────────────────────────────────────────────

def _load_key() -> bytes:
    raw = os.environ.get("DB_ENCRYPTION_KEY", "")
    if not raw:
        raise RuntimeError(
            "DB_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    try:
        key = bytes.fromhex(raw)
    except ValueError:
        raise RuntimeError("DB_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).")
    if len(key) != 32:
        raise RuntimeError(f"DB_ENCRYPTION_KEY must be 32 bytes, got {len(key)}.")
    return key


# ── Public API ────────────────────────────────────────────────────────────────

def encrypt_password(plaintext: str) -> str:
    """
    Encrypt a database password for storage.

    Returns a base64url-encoded string: nonce(12) + ciphertext + tag(16).
    Safe to store directly in MongoDB as a string field.
    """
    return encrypt_field(plaintext)


def decrypt_password(encrypted: str) -> str:
    """
    Decrypt a password retrieved from database.

    Raises ValueError if the ciphertext has been tampered with.
    Raises RuntimeError if DB_ENCRYPTION_KEY is missing/wrong.
    """
    return decrypt_field(encrypted)


def encrypt_field(plaintext: str | Any) -> str:
    """
    Generic encryption for any sensitive field (email, display_name, etc.).
    
    Args:
        plaintext: String or value to encrypt
    
    Returns:
        Base64url-encoded encrypted string safe for MongoDB storage
    """
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    
    key = _load_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_field(encrypted: str) -> str:
    """
    Generic decryption for any sensitive field.
    
    Args:
        encrypted: Base64url-encoded encrypted string from database
    
    Returns:
        Original plaintext string
    
    Raises:
        ValueError: If ciphertext has been tampered with
        RuntimeError: If DB_ENCRYPTION_KEY is missing/wrong
    """
    # Validate input
    if not encrypted or not isinstance(encrypted, str):
        raise ValueError("Encrypted field must be a non-empty string")
    
    key = _load_key()
    aesgcm = AESGCM(key)
    
    # Decode base64, handling invalid padding
    try:
        raw = base64.urlsafe_b64decode(encrypted.encode())
    except Exception as e:
        logger.error(f"Failed to base64 decode field: {e}")
        raise ValueError("Failed to decrypt field — invalid base64 encoding or data corrupted.") from e
    
    # Validate minimum length (12 byte nonce + at least some ciphertext)
    if len(raw) < 12:
        raise ValueError("Failed to decrypt field — encrypted data too short.")
    
    nonce = raw[:12]
    ct = raw[12:]
    try:
        plaintext = aesgcm.decrypt(nonce, ct, None)
    except Exception as e:
        raise ValueError("Failed to decrypt field — key mismatch or data tampered.") from e
    return plaintext.decode()