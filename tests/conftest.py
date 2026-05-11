from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from devscope.storage.models import Base


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(engine, future=True, expire_on_commit=False)
    with SessionLocal() as session:
        yield session


@pytest.fixture
def now() -> datetime:
    return datetime.now(timezone.utc)
