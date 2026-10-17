from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC now (the DB stores naive UTC); replaces deprecated datetime.utcnow()."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utcfromtimestamp(ts: float) -> datetime:
    return datetime.fromtimestamp(ts, timezone.utc).replace(tzinfo=None)
