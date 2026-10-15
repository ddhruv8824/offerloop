"""
services/resume/pdf_generator.py
───────────────────────────────
Generates a beautifully formatted, ATS-compliant PDF resume from structured JSON data.
Uses ReportLab.
"""

import io
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors


def generate_pdf_from_resume_data(data: dict) -> bytes:
    """
    Takes a structured resume JSON dictionary (ResumeData schema) and returns
    the generated PDF as raw bytes.
    """
    buffer = io.BytesIO()
    
    # Standard margins (0.75 inch / 54 points)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Professional slate blue & charcoal palette
    primary_color = colors.HexColor("#1A365D")
    text_color = colors.HexColor("#2D3748")
    
    title_style = ParagraphStyle(
        'ResumeTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=primary_color,
        alignment=1,  # Centered
        spaceAfter=4
    )
    
    contact_style = ParagraphStyle(
        'ResumeContact',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#4A5568"),
        alignment=1,  # Centered
        spaceAfter=12
    )
    
    heading_style = ParagraphStyle(
        'ResumeHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=primary_color,
        spaceBefore=8,
        spaceAfter=4,
        keepWithNext=True
    )
    
    body_style = ParagraphStyle(
        'ResumeBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=text_color,
        spaceAfter=4
    )
    
    bullet_style = ParagraphStyle(
        'ResumeBullet',
        parent=body_style,
        leftIndent=15,
        firstLineIndent=-10,
        spaceAfter=3
    )
    
    # 1. Header (Name & Contact Info)
    contact = data.get("contact", {})
    name = contact.get("name") or "Candidate Name"
    story.append(Paragraph(name, title_style))
    
    contact_parts = []
    if contact.get("email"): contact_parts.append(contact["email"])
    if contact.get("phone"): contact_parts.append(contact["phone"])
    if contact.get("location"): contact_parts.append(contact["location"])
    if contact.get("linkedin"): contact_parts.append("LinkedIn")
    if contact.get("github"): contact_parts.append("GitHub")
    if contact.get("website"): contact_parts.append(contact["website"])
    
    contact_text = "  |  ".join(contact_parts)
    story.append(Paragraph(contact_text, contact_style))
    
    # Helper to add section headers with clean line
    def add_section_header(title):
        header_table = Table([[Paragraph(title, heading_style)]], colWidths=[504])
        header_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.75, primary_color),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        story.append(header_table)
        story.append(Spacer(1, 4))

    # 2. Professional Summary
    summary = data.get("summary")
    if summary:
        add_section_header("PROFESSIONAL SUMMARY")
        story.append(Paragraph(summary, body_style))
        story.append(Spacer(1, 4))
        
    # 3. Skills
    skills = data.get("skills", [])
    if skills:
        add_section_header("TECHNICAL SKILLS")
        skills_text = ", ".join(skills)
        story.append(Paragraph(skills_text, body_style))
        story.append(Spacer(1, 4))
        
    # 4. Work Experience
    experience = data.get("experience", [])
    if experience:
        add_section_header("WORK EXPERIENCE")
        for exp in experience:
            company = exp.get("company") or ""
            title = exp.get("title") or ""
            start = exp.get("start_date") or ""
            end = exp.get("end_date") or "Present"
            location = exp.get("location") or ""
            
            # Header line: Job Title & Company (left), Date & Location (right)
            meta_left = f"<b>{title}</b> — {company}"
            meta_right = f"{start} – {end}"
            if location:
                meta_right += f" | {location}"
                
            meta_table = Table([
                [Paragraph(meta_left, body_style), Paragraph(meta_right, ParagraphStyle('RightMeta', parent=body_style, alignment=2))]
            ], colWidths=[320, 184])
            meta_table.setStyle(TableStyle([
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
            ]))
            story.append(meta_table)
            
            # Bullets
            bullets = exp.get("bullets", [])
            for bullet in bullets:
                story.append(Paragraph(f"&bull; {bullet}", bullet_style))
            story.append(Spacer(1, 3))
            
    # 5. Education
    education = data.get("education", [])
    if education:
        add_section_header("EDUCATION")
        for edu in education:
            inst = edu.get("institution") or ""
            deg = edu.get("degree") or ""
            field = edu.get("field_of_study") or ""
            grad = edu.get("graduation_date") or ""
            gpa = edu.get("gpa") or ""
            
            edu_left = f"<b>{deg}</b> in {field}" if (deg and field) else f"<b>{deg or field}</b>"
            edu_left = f"{edu_left}, {inst}" if inst else edu_left
            edu_right = grad
            if gpa:
                edu_right += f" | GPA: {gpa}"
                
            edu_table = Table([
                [Paragraph(edu_left, body_style), Paragraph(edu_right, ParagraphStyle('RightMeta', parent=body_style, alignment=2))]
            ], colWidths=[380, 124])
            edu_table.setStyle(TableStyle([
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                ('TOPPADDING', (0, 0), (-1, -1), 1),
            ]))
            story.append(edu_table)
            story.append(Spacer(1, 3))
            
    # 6. Certifications & Languages
    certs = data.get("certifications", [])
    langs = data.get("languages", [])
    if certs or langs:
        if certs and langs:
            add_section_header("CERTIFICATIONS & LANGUAGES")
            story.append(Paragraph(f"<b>Certifications:</b> {', '.join(certs)}", body_style))
            story.append(Paragraph(f"<b>Languages:</b> {', '.join(langs)}", body_style))
        elif certs:
            add_section_header("CERTIFICATIONS")
            story.append(Paragraph(", ".join(certs), body_style))
        else:
            add_section_header("LANGUAGES")
            story.append(Paragraph(", ".join(langs), body_style))
            
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
