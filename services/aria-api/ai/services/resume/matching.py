"""
services/resume/matching.py
───────────────────────────
Compares resume data against a Job Description, calculates match score/gaps,
and adapts/rewrites resume details to align with the target job.
"""

import json
from typing import Optional
from google import genai
from google.genai import types
from shared.config import API_KEY


def check_resume_jd_match(resume_text: str, jd_text: str) -> dict:
    """
    Compare raw resume text or formatted context against a Job Description.
    Returns:
      {
        "match_score": int (0-100),
        "is_match": bool,
        "reason": str,
        "gaps": list[str]
      }
    """
    client = genai.Client(api_key=API_KEY)
    prompt = f"""\
Task Description: Assess the compatibility between a candidate's resume and a target job description, identifying alignment and critical gaps.

Inputs:
---
Resume Text:
{resume_text}

Job Description:
{jd_text}

Instructions:
1. Compare the technical skillsets, experience levels, and domain expertise.
2. Formulate a compatibility score between 0 and 100.
3. Mark "is_match" as true only if the score is greater than or equal to 60.
4. List key requirements from the Job Description that are missing in the Resume as distinct gaps.
5. Provide a 2-3 sentence logical reasoning explaining the rating.

Outputs:
---
Output Format: Respond ONLY with a valid JSON object matching this schema:
{{
  "match_score": <int between 0 and 100>,
  "is_match": <boolean>,
  "reason": "<string>",
  "gaps": ["<gap 1>", "<gap 2>", ...]
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )
        return json.loads(response.text.strip())
    except Exception as exc:
        # Fallback in case of error
        return {
            "match_score": 50,
            "is_match": True,
            "reason": f"Fallback check: match analysis encountered an issue ({exc})",
            "gaps": []
        }


def adapt_resume_to_jd(resume_json: dict, jd_text: str) -> dict:
    """
    Asks Gemini to rewrite professional summary, skills list, and work experience bullets
    to match the Job Description requirements, keeping all factual dates/companies intact.
    """
    client = genai.Client(api_key=API_KEY)
    prompt = f"""\
Task Description: Adapt a candidate's resume to match a target job description (JD) by optimizing the summary, skills, and experience bullet points for relevance while preserving all factual data and history.

Inputs:
---
Original Resume JSON:
{json.dumps(resume_json, indent=2)}

Target Job Description:
{jd_text}

Instructions:
1. Retain all original contact details, companies, job titles, education history, certifications, and languages exactly as they are in the original resume.
2. Do NOT fabricate any new jobs, degrees, certifications, or factual details.
3. Update the professional summary to highlight the candidate's transferable skills and relevant qualifications for the JD.
4. Rephrase experience bullet points to emphasize accomplishments and responsibilities that relate to the target job requirements.
5. If the target JD is in a different domain (e.g. hospitality, office support, service, retail) than the candidate's background (e.g. software engineering), you must translate all technical jargon (e.g. software development, coding, APIs, databases) into clean, professional, transferable operational and business terms (e.g. quality assurance, workflow optimization, customer satisfaction, task prioritization, inventory organization, systematic execution).
6. Do NOT use hybrid phrases or parenthesized/quoted tech explanations (e.g. do NOT write "delivered products (software solutions)" or "exceptional customer experience (user interfaces)"). It must read naturally for the target role as if the candidate is focusing on their general operational excellence and attention to detail.
7. Update the skills list to match the target JD. Replace technical skills (e.g. React, Python, Git) with soft and operational skills relevant to the target role (e.g. Quality Control, Customer Service, Hygiene Standards, Inventory Management, Time Management, Diligence).

Outputs:
---
Output Format: Respond ONLY with a valid JSON object matching the ResumeData schema structure:
{{
  "contact": {{
    "name": "...",
    "email": "...",
    "phone": "...",
    "linkedin": "...",
    "github": "...",
    "location": "...",
    "website": "..."
  }},
  "summary": "...",
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {{
      "company": "...",
      "title": "...",
      "start_date": "...",
      "end_date": "...",
      "location": "...",
      "bullets": ["adapted bullet 1", "adapted bullet 2", ...]
    }},
    ...
  ],
  "education": [
    {{
      "institution": "...",
      "degree": "...",
      "field_of_study": "...",
      "graduation_date": "...",
      "gpa": "..."
    }}
  ],
  "certifications": ["...", ...],
  "languages": ["...", ...]
}}
"""
    try:
        response = client.models.generate_content(
            model="gemini-flash-latest",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )
        return json.loads(response.text.strip())
    except Exception as exc:
        # Fallback is to return original data
        return resume_json
