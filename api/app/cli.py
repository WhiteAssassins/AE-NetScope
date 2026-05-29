import asyncio

from app.bootstrap import ensure_demo_inventory, ensure_local_admin


async def main() -> None:
    await ensure_local_admin()
    await ensure_demo_inventory()
    print("AE NetScope local database is ready.")


if __name__ == "__main__":
    asyncio.run(main())
