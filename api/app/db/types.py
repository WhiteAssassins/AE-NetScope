from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

from app.services.data_protection import decrypt_sensitive_text, encrypt_sensitive_text


class EncryptedText(TypeDecorator[str]):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, _dialect) -> str | None:
        if value is None:
            return None
        return encrypt_sensitive_text(value)

    def process_result_value(self, value: str | None, _dialect) -> str | None:
        if value is None:
            return None
        return decrypt_sensitive_text(value)
