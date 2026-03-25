# connections/core/encryption.py
"""
AES-256-GCM encryption for database passwords stored in Firestore.

The encryption key is loaded from the environment variable:
    DB_ENCRYPTION_KEY  — 32-byte (256-bit) hex string

Generate a key:
    python -c "import secrets; print(secrets.token_hex(32))"

Add to .env:
    DB_ENCRYPTION_KEY=<output from above>

Why AES-256-GCM:
  • Authenticated encryption — detects tampering (integrity + confidentiality)
  • Each encryption uses a fresh random 12-byte nonce — same password never
    produces the same ciphertext twice
  • Industry standard for secrets at rest

Storage format (base64-encoded):
    <12-byte nonce> + <ciphertext> + <16-byte auth tag>
    All concatenated then base64url-encoded into a single string.
"""
from __future__ import annotations

import base64
import logging
import os

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
    Encrypt a database password for storage in Firestore.

    Returns a base64url-encoded string: nonce(12) + ciphertext + tag(16).
    Safe to store directly in Firestore as a string field.
    """
    key   = _load_key()
    aesgcm = AESGCM(key)
    nonce  = os.urandom(12)                         # fresh 12-byte nonce each time
    ct     = aesgcm.encrypt(nonce, plaintext.encode(), None)  # ct includes auth tag
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_password(encrypted: str) -> str:
    """
    Decrypt a password retrieved from Firestore.

    Raises ValueError if the ciphertext has been tampered with.
    Raises RuntimeError if DB_ENCRYPTION_KEY is missing/wrong.
    """
    key    = _load_key()
    aesgcm = AESGCM(key)
    raw    = base64.urlsafe_b64decode(encrypted.encode())
    nonce  = raw[:12]
    ct     = raw[12:]
    try:
        plaintext = aesgcm.decrypt(nonce, ct, None)
    except Exception:
        raise ValueError("Failed to decrypt password — key mismatch or data tampered.")
    return plaintext.decode()