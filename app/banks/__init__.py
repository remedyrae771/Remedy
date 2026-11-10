from .base import BankError
from .demo import DemoProvider
from .gocardless import GoCardlessProvider

_providers = {}


def get_provider(name: str):
    if name not in _providers:
        if name == "demo":
            _providers[name] = DemoProvider()
        elif name == "gocardless":
            _providers[name] = GoCardlessProvider()
        else:
            raise BankError(f"Неизвестный провайдер: {name}")
    return _providers[name]


def set_provider(name: str, provider) -> None:
    """Для тестов: подменить провайдера."""
    _providers[name] = provider


def available_providers() -> list[dict]:
    return [
        {"id": "gocardless", "name": "Open Banking (GoCardless, банки ЕС/UK)",
         "configured": get_provider("gocardless").configured},
        {"id": "demo", "name": "Демо-банк", "configured": True},
    ]
