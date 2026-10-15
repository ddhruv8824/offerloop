"""
api/routers/resume.py
──────────────────────
Resume service router.

Endpoints:
    POST /resume/parse      → upload a PDF/DOCX, receive structured JSON data
    POST /resume/context    → upload a PDF/DOCX, receive the system-prompt context block
"""

import tempfile
import os
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, status

from services.resume        import parse_resume, load_resume_context
from services.resume.context import build_resume_system_block
from api.models.resume      import ResumeParseResponse, ResumeContextResponse, ContactInfoOut, ExperienceOut, EducationOut

router = APIRouter(prefix="/resume", tags=["Resume"])

_ALLOWED_EXTENSIONS = {".pdf", ".docx"}


def _save_upload(upload: UploadFile) -> Path:
    """
    Save the uploaded file to a temporary location and return the path.
    Raises HTTPException 400 if the file type is not supported.
    """
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Upload a PDF or DOCX file.",
        )

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(upload.file.read())
        tmp.flush()
        return Path(tmp.name)
    finally:
        tmp.close()


@router.post(
    "/parse",
    response_model=ResumeParseResponse,
    summary="Parse a resume file",
    description=(
        "Upload a **PDF** or **DOCX** resume and receive the fully structured "
        "candidate data as JSON: contact info, skills, experience, education, "
        "certifications, and languages."
    ),
)
async def parse_resume_endpoint(
    file: UploadFile = File(..., description="Resume file — PDF or DOCX"),
) -> ResumeParseResponse:
    tmp_path = _save_upload(file)

    try:
        data = parse_resume(tmp_path, original_filename=file.filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse resume: {exc}",
        )
    finally:
        os.unlink(tmp_path)

    return ResumeParseResponse(
        source_file=file.filename or "",
        contact=ContactInfoOut(
            name=data.contact.name,
            email=data.contact.email,
            phone=data.contact.phone,
            linkedin=data.contact.linkedin,
            github=data.contact.github,
            location=data.contact.location,
            website=data.contact.website,
        ),
        summary=data.summary,
        skills=data.skills,
        experience=[
            ExperienceOut(
                company=exp.company,
                title=exp.title,
                start_date=exp.start_date,
                end_date=exp.end_date,
                location=exp.location,
                bullets=exp.bullets,
            )
            for exp in data.experience
        ],
        education=[
            EducationOut(
                institution=edu.institution,
                degree=edu.degree,
                field_of_study=edu.field_of_study,
                graduation_date=edu.graduation_date,
                gpa=edu.gpa,
            )
            for edu in data.education
        ],
        certifications=data.certifications,
        languages=data.languages,
    )


@router.post(
    "/context",
    response_model=ResumeContextResponse,
    summary="Generate resume system-prompt context",
    description=(
        "Upload a **PDF** or **DOCX** resume and receive a pre-formatted context "
        "block ready to be embedded in a Gemini system instruction. This is the "
        "same block the voice assistant injects at session start."
    ),
)
async def resume_context_endpoint(
    file: UploadFile = File(..., description="Resume file — PDF or DOCX"),
) -> ResumeContextResponse:
    tmp_path = _save_upload(file)

    try:
        data    = parse_resume(tmp_path, original_filename=file.filename)
        context = build_resume_system_block(data)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to build resume context: {exc}",
        )
    finally:
        os.unlink(tmp_path)

    return ResumeContextResponse(
        filename=file.filename or "",
        context_block=context,
        candidate_name=data.contact.name,
        skill_count=len(data.skills),
        role_count=len(data.experience),
        education_count=len(data.education),
    )


from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
from services.resume import check_resume_jd_match, adapt_resume_to_jd, generate_pdf_from_resume_data


class ResumeMatchRequest(BaseModel):
    resume_text: str
    jd_text: str


class ResumeMatchResponse(BaseModel):
    match_score: int
    is_match: bool
    reason: str
    gaps: list[str]


class ResumeAdaptRequest(BaseModel):
    resume_data: dict
    jd_text: str


@router.post(
    "/match",
    response_model=ResumeMatchResponse,
    summary="Check resume and Job Description compatibility",
)
async def resume_match_endpoint(req: ResumeMatchRequest) -> ResumeMatchResponse:
    try:
        res = check_resume_jd_match(req.resume_text, req.jd_text)
        return ResumeMatchResponse(
            match_score=res.get("match_score", 50),
            is_match=res.get("is_match", True),
            reason=res.get("reason", "Analyzed successfully."),
            gaps=res.get("gaps", []),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Match evaluation failed: {exc}",
        )


@router.post(
    "/adapt",
    response_model=ResumeParseResponse,
    summary="Adapt professional resume to fit the Job Description",
)
async def resume_adapt_endpoint(req: ResumeAdaptRequest) -> ResumeParseResponse:
    try:
        adapted_data = adapt_resume_to_jd(req.resume_data, req.jd_text)
        
        # Format contact, experience, education properly for Response Model
        contact_dict = adapted_data.get("contact", {})
        contact_out = ContactInfoOut(
            name=contact_dict.get("name"),
            email=contact_dict.get("email"),
            phone=contact_dict.get("phone"),
            linkedin=contact_dict.get("linkedin"),
            github=contact_dict.get("github"),
            location=contact_dict.get("location"),
            website=contact_dict.get("website"),
        )
        
        experience_out = [
            ExperienceOut(
                company=exp.get("company"),
                title=exp.get("title"),
                start_date=exp.get("start_date"),
                end_date=exp.get("end_date"),
                location=exp.get("location"),
                bullets=exp.get("bullets") or [],
            )
            for exp in adapted_data.get("experience", [])
        ]
        
        education_out = [
            EducationOut(
                institution=edu.get("institution"),
                degree=edu.get("degree"),
                field_of_study=edu.get("field_of_study"),
                graduation_date=edu.get("graduation_date"),
                gpa=edu.get("gpa"),
            )
            for edu in adapted_data.get("education", [])
        ]
        
        return ResumeParseResponse(
            source_file="Adapted Resume",
            contact=contact_out,
            summary=adapted_data.get("summary"),
            skills=adapted_data.get("skills") or [],
            experience=experience_out,
            education=education_out,
            certifications=adapted_data.get("certifications") or [],
            languages=adapted_data.get("languages") or [],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Adaptation failed: {exc}",
        )


@router.post(
    "/generate-pdf",
    summary="Compile structured resume JSON to PDF binary",
)
async def resume_generate_pdf_endpoint(req_data: dict) -> StreamingResponse:
    try:
        pdf_bytes = generate_pdf_from_resume_data(req_data)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": "attachment; filename=tailored_resume.pdf",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"PDF generation failed: {exc}",
        )

