import os
from datetime import date, datetime

import psycopg2


def vet_get_db_connection():
    """Create and return a PostgreSQL connection for vet endpoints."""
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL is not configured.")
    return psycopg2.connect(db_url)


def vet_serialize_records(records):
    """Convert date/time values to JSON-safe ISO strings."""
    serialized = []
    for row in records:
        normalized = {}
        for key, value in row.items():
            if isinstance(value, (date, datetime)):
                normalized[key] = value.isoformat()
            else:
                normalized[key] = value
        serialized.append(normalized)
    return serialized
