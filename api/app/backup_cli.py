import argparse
from pathlib import Path

from app.services.backups import decrypt_backup_file, encrypt_backup_file


def main() -> None:
    parser = argparse.ArgumentParser(description="AE NetScope backup protection utility")
    parser.add_argument("command", choices=["encrypt", "decrypt"])
    parser.add_argument("path", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    if args.command == "encrypt":
        print(encrypt_backup_file(args.path))
    elif args.output is None:
        parser.error("--output is required when decrypting a backup")
    else:
        print(decrypt_backup_file(args.path, args.output))


if __name__ == "__main__":
    main()
