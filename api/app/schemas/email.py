from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import AfterValidator, Field

# Home networks commonly use these names, which email_validator rejects as special-use.
# They are fine for account sign-in, since AE NetScope never sends email to them.
LOCAL_NETWORK_DOMAINS = ("local", "home.arpa")


def validate_account_email(value: str) -> str:
    candidate = value.strip()
    local_part, separator, domain = candidate.rpartition("@")
    lowered_domain = domain.lower()
    for suffix in LOCAL_NETWORK_DOMAINS:
        if separator and (lowered_domain == suffix or lowered_domain.endswith(f".{suffix}")):
            host = lowered_domain[: -len(suffix)].rstrip(".")
            # Check the address syntax against a public stand-in, then keep the real domain.
            stand_in = f"{host}.example.com" if host else "example.com"
            try:
                checked = validate_email(f"{local_part}@{stand_in}", check_deliverability=False)
            except EmailNotValidError as exc:
                raise ValueError(f"value is not a valid email address: {exc}") from exc
            return f"{checked.local_part}@{lowered_domain}"
    try:
        return validate_email(candidate, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise ValueError(f"value is not a valid email address: {exc}") from exc


AccountEmail = Annotated[
    str,
    Field(min_length=3, max_length=320),
    AfterValidator(validate_account_email),
]
