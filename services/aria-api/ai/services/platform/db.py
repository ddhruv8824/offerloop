"""
ai/services/platform/db.py
──────────────────────────
Database engine setup and SQLModel table definitions for Company,
CommunityQuestion, Blog, and Registration entities.
"""

from __future__ import annotations

from typing import Optional
from sqlmodel import SQLModel, Field, create_engine, Session, Column, JSON
from shared.config import DATABASE_URL

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────

class Company(SQLModel, table=True):
    __tablename__ = "companies"

    id: str = Field(primary_key=True)
    name: str
    tagline: str
    color: str
    # Store list of strings as JSON block (safe for SQLite and PostgreSQL)
    focus_areas: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class CommunityQuestion(SQLModel, table=True):
    __tablename__ = "community_questions"

    id: str = Field(primary_key=True)
    company_id: str
    category: str
    question: str
    source: str = "community"
    created_at: str


class Blog(SQLModel, table=True):
    __tablename__ = "blogs"

    id: str = Field(primary_key=True)
    company_id: str
    title: str
    author_label: str = "Anonymous"
    excerpt: str
    body: str
    created_at: str


class Registration(SQLModel, table=True):
    __tablename__ = "registrations"

    id: str = Field(primary_key=True)
    email: str
    company_id: str
    registered_at: str


# ──────────────────────────────────────────────
# Connection Engine
# ──────────────────────────────────────────────

# SQLite needs "connect_args={'check_same_thread': False}" for multi-thread support.
# PostgreSQL does not need it.
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)


def init_db() -> None:
    """Create database tables if they do not exist."""
    SQLModel.metadata.create_all(engine)
