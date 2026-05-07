import json
from pathlib import Path
from typing import Any

_STORE_FILE = Path(__file__).resolve().with_name("_microchip_news_store.json")


def _read_store() -> list[dict[str, Any]]:
    if not _STORE_FILE.exists():
        return []
    try:
        raw = json.loads(_STORE_FILE.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [item for item in raw if isinstance(item, dict)]
    except Exception:
        return []


def save_microchip_news_store(items: list[dict[str, Any]]) -> None:
    _STORE_FILE.write_text(
        json.dumps(items, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def add_microchip_news(news_payload: dict[str, Any]) -> dict[str, Any]:
    items = _read_store()
    max_news_id = max((int(item.get("news_id") or 0) for item in items), default=0)

    item = {
        "news_id": max_news_id + 1,
        **news_payload,
    }
    item["is_unread"] = bool(item.get("is_unread", True))
    item["is_unread_owner"] = bool(item.get("is_unread_owner", False))
    items.append(item)
    save_microchip_news_store(items)
    return item


def get_microchip_news_store() -> list[dict[str, Any]]:
    return _read_store()
