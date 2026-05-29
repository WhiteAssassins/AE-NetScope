from app.core.security import hash_password, verify_password


def test_password_hash_uses_argon2id() -> None:
    password_hash = hash_password("correct horse battery staple")

    assert password_hash.startswith("$argon2id$")
    assert verify_password("correct horse battery staple", password_hash)
    assert not verify_password("wrong password", password_hash)
