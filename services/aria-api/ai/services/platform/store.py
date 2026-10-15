"""
services/platform/store.py
──────────────────────────
PostgreSQL/SQLite-backed store for company practice content (homepage + AI context)
using SQLModel.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import Session, select
from .db import engine, Company, CommunityQuestion, Blog, Registration


def list_companies() -> list[dict[str, Any]]:
    with Session(engine) as session:
        statement = select(Company)
        companies = session.exec(statement).all()
        return [c.model_dump() for c in companies]


def get_company(company_id: str) -> Optional[dict[str, Any]]:
    with Session(engine) as session:
        company = session.get(Company, company_id)
        return company.model_dump() if company else None


def list_community_questions(company_id: str | None = None) -> list[dict[str, Any]]:
    with Session(engine) as session:
        statement = select(CommunityQuestion)
        if company_id:
            statement = statement.where(CommunityQuestion.company_id == company_id)
        questions = session.exec(statement).all()
        rows = [q.model_dump() for q in questions]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)


def list_blogs(company_id: str | None = None) -> list[dict[str, Any]]:
    with Session(engine) as session:
        statement = select(Blog)
        if company_id:
            statement = statement.where(Blog.company_id == company_id)
        blogs = session.exec(statement).all()
        rows = [b.model_dump() for b in blogs]
        return sorted(rows, key=lambda r: r.get("created_at", ""), reverse=True)


def add_community_question(
    *,
    company_id: str,
    question: str,
    category: str = "general",
) -> dict[str, Any]:
    if not get_company(company_id):
        raise ValueError(f"Unknown company: {company_id}")

    entry = CommunityQuestion(
        id=f"q_{uuid.uuid4().hex[:8]}",
        company_id=company_id,
        category=category.strip() or "general",
        question=question.strip(),
        source="community",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    with Session(engine) as session:
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry.model_dump()


def add_blog(
    *,
    company_id: str,
    title: str,
    body: str,
    author_label: str = "Anonymous",
) -> dict[str, Any]:
    if not get_company(company_id):
        raise ValueError(f"Unknown company: {company_id}")

    excerpt = body.strip()[:220] + ("…" if len(body.strip()) > 220 else "")
    entry = Blog(
        id=f"b_{uuid.uuid4().hex[:8]}",
        company_id=company_id,
        title=title.strip(),
        author_label=author_label.strip() or "Anonymous",
        excerpt=excerpt,
        body=body.strip(),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    with Session(engine) as session:
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry.model_dump()


def register_practice_session(*, email: str, company_id: Optional[str] = None) -> dict[str, Any]:
    email_clean = email.strip().lower()
    if "@" not in email_clean or "." not in email_clean.split("@")[-1]:
        raise ValueError("Invalid email address")
    if company_id and not get_company(company_id):
        raise ValueError(f"Unknown company: {company_id}")

    entry = Registration(
        id=uuid.uuid4().hex[:12],
        email=email_clean,
        company_id=company_id or "",
        registered_at=datetime.now(timezone.utc).isoformat(),
    )
    with Session(engine) as session:
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry.model_dump()


def get_company_context_block(company_id: str) -> str:
    """Build AI system-prompt block from company profile + community data."""
    company = get_company(company_id)
    if not company:
        return ""

    questions = list_community_questions(company_id)[:12]
    blogs = list_blogs(company_id)[:5]

    lines = [
        "--- COMPANY INTERVIEW CONTEXT ---",
        f"Target company: {company.get('name', company_id)}",
        f"Interview style: {company.get('tagline', '')}",
    ]
    focus = company.get("focus_areas") or []
    if focus:
        lines.append("Focus areas: " + ", ".join(focus))

    if questions:
        lines.append("")
        lines.append("Community-reported questions (use as inspiration — do not claim they are official):")
        for q in questions:
            cat = q.get("category", "general")
            lines.append(f"  • [{cat}] {q.get('question', '')}")

    if blogs:
        lines.append("")
        lines.append("Recent candidate experiences (summarize themes, do not read verbatim):")
        for b in blogs:
            lines.append(f"  • {b.get('title', '')}: {b.get('excerpt', '')}")

    lines.append("")
    lines.append(
        "Tailor verbal and coding questions to this company's style. Reference their focus areas "
        "and realistic question patterns above."
    )
    lines.append("--- END COMPANY CONTEXT ---")
    return "\n".join(lines)
