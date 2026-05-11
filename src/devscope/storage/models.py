from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[str]: JSON}


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    path: Mapped[str] = mapped_column(String, unique=True)
    summary: Mapped[str | None] = mapped_column(Text, default=None)
    tech_stack: Mapped[list[str] | None] = mapped_column(JSON, default=None)
    readme_excerpt: Mapped[str | None] = mapped_column(Text, default=None)
    last_scanned_at: Mapped[datetime | None] = mapped_column(default=None)
    last_activity_at: Mapped[datetime | None] = mapped_column(default=None)
    state: Mapped[str] = mapped_column(String, default="active")
    extra: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    events: Mapped[list["Event"]] = relationship(back_populates="project",
                                                 cascade="all, delete-orphan")
    ideas: Mapped[list["Idea"]] = relationship(back_populates="project",
                                               cascade="all, delete-orphan")


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (UniqueConstraint("source", "external_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String)
    type: Mapped[str] = mapped_column(String)
    external_id: Mapped[str | None] = mapped_column(String, default=None)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    occurred_at: Mapped[datetime]
    collected_at: Mapped[datetime]

    project: Mapped[Project | None] = relationship(back_populates="events")


class Idea(Base):
    __tablename__ = "ideas"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String, default="suggested")
    generation_id: Mapped[int | None] = mapped_column(
        ForeignKey("idea_generations.id"), default=None
    )
    created_at: Mapped[datetime]
    closed_at: Mapped[datetime | None] = mapped_column(default=None)

    project: Mapped[Project] = relationship(back_populates="ideas")


class IdeaGeneration(Base):
    __tablename__ = "idea_generations"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    llm_call_id: Mapped[int | None] = mapped_column(ForeignKey("llm_calls.id"), default=None)
    snapshot_at: Mapped[datetime]
    created_at: Mapped[datetime]


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL")
    )
    type: Mapped[str] = mapped_column(String)
    period_start: Mapped[datetime | None] = mapped_column(default=None)
    period_end: Mapped[datetime | None] = mapped_column(default=None)
    content: Mapped[str] = mapped_column(Text)
    llm_call_id: Mapped[int | None] = mapped_column(ForeignKey("llm_calls.id"), default=None)
    generated_at: Mapped[datetime]


class LLMCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String)
    model: Mapped[str] = mapped_column(String)
    purpose: Mapped[str] = mapped_column(String)
    prompt_tokens: Mapped[int | None] = mapped_column(default=None)
    output_tokens: Mapped[int | None] = mapped_column(default=None)
    cost_usd: Mapped[float | None] = mapped_column(default=None)
    duration_ms: Mapped[int | None] = mapped_column(default=None)
    succeeded: Mapped[bool]
    error: Mapped[str | None] = mapped_column(Text, default=None)
    called_at: Mapped[datetime]


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(primary_key=True)
    value: Mapped[str] = mapped_column(Text)
