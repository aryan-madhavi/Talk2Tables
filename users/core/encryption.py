# users/core/encryption.py
"""
User data encryption layer — encrypts sensitive fields at storage layer.

Encrypted fields:
  • email — user's email address
  • display_name — user's display name

Non-encrypted fields (needed for queries):
  • _id, firebase_uid, role, is_active, created_at, etc.

Usage:
  1. encrypt_user_doc() — before inserting into MongoDB
  2. decrypt_user_doc() — after reading from MongoDB
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from connections.core.encryption import encrypt_field, decrypt_field

logger = logging.getLogger(__name__)

# Fields that should be encrypted at rest
ENCRYPTED_FIELDS = {"email", "display_name"}

# Fields that must remain queryable (never encrypt)
# email_hash is kept plaintext for queryable email lookups
QUERYABLE_FIELDS = {"_id", "firebase_uid", "role", "is_active", "created_at", "last_login_at", "email_hash", "password_hash"}


def encrypt_user_doc(user_doc: dict) -> dict:
    """
    Encrypt sensitive fields in a user document before storage.
    
    Args:
        user_doc: User document from the application
    
    Returns:
        User document with sensitive fields encrypted
    
    Note:
        This should be called before insert_one() or update_one()
    """
    doc = user_doc.copy()
    for field in ENCRYPTED_FIELDS:
        if field in doc and doc[field]:
            try:
                doc[field] = encrypt_field(str(doc[field]))
            except Exception as e:
                logger.error(f"Failed to encrypt {field}: {e}")
                raise
    return doc


def decrypt_user_doc(user_doc: dict) -> dict:
    """
    Decrypt sensitive fields in a user document after retrieval.
    
    Args:
        user_doc: User document from MongoDB
    
    Returns:
        User document with sensitive fields decrypted
        (corrupted fields will be returned as empty strings)
    
    Note:
        This should be called after find_one() or after iterating find()
        Returns the same dict to allow chaining.
    """
    if not user_doc:
        return user_doc
    
    doc = user_doc.copy()
    for field in ENCRYPTED_FIELDS:
        if field in doc and doc[field]:
            try:
                doc[field] = decrypt_field(doc[field])
            except Exception as e:
                logger.warning(f"Could not decrypt {field} (returning empty): {e}")
                # Return empty string for corrupted fields instead of crashing
                # This allows viewing other user data even if one field is corrupted
                doc[field] = ""
    return doc


def encrypt_user_docs_list(docs: list[dict]) -> list[dict]:
    """Encrypt a list of user documents."""
    return [encrypt_user_doc(doc) for doc in docs]


def decrypt_user_docs_list(docs: list[dict]) -> list[dict]:
    """Decrypt a list of user documents."""
    return [decrypt_user_doc(doc) for doc in docs]
