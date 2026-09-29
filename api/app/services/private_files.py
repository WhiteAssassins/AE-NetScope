import os
from pathlib import Path
from typing import BinaryIO


def open_private_file(path: Path) -> BinaryIO:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        return os.fdopen(descriptor, "wb")
    except Exception:
        os.close(descriptor)
        raise
