"""MAC vendor lookup from a bundled IEEE OUI list (independent of UniFi)."""
from functools import lru_cache
from pathlib import Path

_DATA = Path(__file__).parent / "data" / "oui.tsv"
_LENGTHS = (9, 7, 6)  # MA-S, MA-M, MA-L; longest (most specific) match wins


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    table: dict[str, str] = {}
    try:
        with _DATA.open(encoding="utf-8") as f:
            for line in f:
                if line.startswith("#"):
                    continue
                prefix, _, vendor = line.rstrip("\n").partition("\t")
                if prefix and vendor:
                    table[prefix] = vendor
    except OSError:
        pass
    return table


def is_private_mac(mac: str) -> bool:
    """Locally administered bit set: likely a randomized/private address."""
    try:
        return bool(int(mac[:2], 16) & 0x02)
    except ValueError:
        return False


def lookup_vendor(mac: str | None) -> str | None:
    if not mac:
        return None
    digits = "".join(c for c in mac.lower() if c in "0123456789abcdef")
    if len(digits) < 6 or is_private_mac(digits):
        return None
    table = _table()
    for n in _LENGTHS:
        vendor = table.get(digits[:n])
        if vendor:
            return vendor
    return None
