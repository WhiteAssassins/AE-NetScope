from sqlalchemy import Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AppState(Base):
    __tablename__ = "app_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    setup_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    admin_guard: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
