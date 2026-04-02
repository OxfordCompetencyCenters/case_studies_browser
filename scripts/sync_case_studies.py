#!/usr/bin/env python3
"""
Scrape Oxford AI Centre case studies and write case_studies_cache.json.

This script mirrors the parsing logic from scripts/extract-case-studies.js.
It runs in GitHub Actions on a daily cron schedule.
"""

import html
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://oerc.ox.ac.uk"
LANDING_PAGES = [
    {
        "sector": "AI in Education",
        "url": "https://oerc.ox.ac.uk/ai-centre/ai-in-education-case-studies",
        "slug_prefix": "/ai-centre/ai-in-education-case-studies/",
    },
    {
        "sector": "AI in Research",
        "url": "https://oerc.ox.ac.uk/ai-centre/ai-in-research-case-studies",
        "slug_prefix": "/ai-centre/ai-in-research-case-studies/",
    },
    {
        "sector": "AI in Professional Services",
        "url": "https://oerc.ox.ac.uk/ai-centre/ai-in-professional-services-case-studies",
        "slug_prefix": "/ai-centre/ai-in-professional-services-case-studies/",
    },
]
OUTPUT_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "case_studies_cache.json",
)
REQUEST_TIMEOUT = 30
USER_AGENT = "Mozilla/5.0 (compatible; AICC-Case-Studies-Bot/1.0)"
MAX_CONCURRENT = 3


def log(msg):
    print(f"[SyncCaseStudies] {msg}", file=sys.stderr)


def fetch_with_retry(url, retries=3):
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            log(f"Fetch attempt {attempt + 1}/{retries} failed for {url}: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
    return None


def decode_text(text):
    """Decode HTML entities and strip tags."""
    if not text:
        return ""
    text = html.unescape(text)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_apostrophes(text):
    return re.sub(r"[\u2018\u2019]", "'", text)


def split_names(text):
    return [s.strip() for s in re.split(r"\s+(?:and|&)\s+", text, flags=re.IGNORECASE) if s.strip()]


def looks_like_person_name(text):
    normalized = normalize_apostrophes(text).strip()
    if not normalized:
        return False
    if re.search(r"\b(Department|Faculty|School|College|University|Students|Project|Programme|Course)\b", normalized):
        return False
    return bool(re.match(r"^[A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,4}$", normalized))


def extract_contributor_info(intro_text, paragraphs):
    contributor_line = intro_text or ""
    names = []
    display_line = ""

    if contributor_line:
        lead = contributor_line.split(",")[0].strip()
        for candidate in split_names(lead):
            if looks_like_person_name(candidate):
                names.append(candidate)
        if names:
            display_line = contributor_line

    if not names and paragraphs:
        match = re.search(r"\bFor ([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){1,4}),", paragraphs[0])
        if match and looks_like_person_name(match.group(1)):
            names.append(match.group(1))
            display_line = match.group(1)

    return {"contributor_line": display_line, "people": list(set(names))}


def title_to_categories(title, paragraphs, sector):
    haystack = f"{title} {' '.join(paragraphs)}".lower()
    categories = []
    rules = [
        ("teaching", "teaching"),
        ("learning", "learning support"),
        ("student", "student support"),
        ("research", "research workflow"),
        ("policy", "policy implementation"),
        ("survey", "survey analysis"),
        ("transcription", "transcription"),
        ("ocr", "ocr and extraction"),
        ("manuscript", "digital humanities"),
        ("coding", "coding support"),
        ("code", "coding support"),
        ("communication", "communications"),
        ("newsletter", "communications"),
        ("review", "draft review"),
        ("feedback", "feedback"),
        ("accessibility", "accessibility"),
        ("revision", "revision support"),
        ("prototype", "prototyping"),
        ("workflow", "workflow improvement"),
        ("process", "process improvement"),
        ("technical", "technical troubleshooting"),
        ("404", "technical troubleshooting"),
        ("ga4", "analytics"),
        ("bias", "bias auditing"),
        ("geographic", "bias auditing"),
        ("asset", "information management"),
        ("grant", "grants administration"),
        ("audio", "audio processing"),
    ]
    for needle, label in rules:
        if needle in haystack:
            categories.append(label)
    if not categories:
        if sector == "AI in Education":
            categories.append("education practice")
        elif sector == "AI in Research":
            categories.append("research practice")
        else:
            categories.append("professional services practice")
    return list(dict.fromkeys(categories))[:5]


def title_to_tools(title, paragraphs):
    haystack = f"{title} {' '.join(paragraphs)}"
    tools = []
    patterns = [
        ("ChatGPT", re.compile(r"\bChatGPT\b", re.IGNORECASE)),
        ("Gemini", re.compile(r"\bGemini\b", re.IGNORECASE)),
        ("Microsoft Copilot", re.compile(r"\bMicrosoft Copilot\b", re.IGNORECASE)),
        ("Codex", re.compile(r"\bCodex\b", re.IGNORECASE)),
        ("NotebookLM", re.compile(r"\bNotebookLM\b", re.IGNORECASE)),
    ]
    for label, pattern in patterns:
        if pattern.search(haystack):
            tools.append(label)
    return list(dict.fromkeys(tools))


def title_to_themes(title, paragraphs):
    haystack = f"{title} {' '.join(paragraphs)}".lower()
    themes = []
    rules = [
        ("time", "time savings"),
        ("verify", "verification"),
        ("check", "human review"),
        ("critical", "critical use"),
        ("privacy", "privacy"),
        ("secure", "security"),
        ("scale", "scalability"),
        ("socratic", "socratic prompting"),
        ("prototype", "rapid prototyping"),
        ("draft", "draft refinement"),
        ("personal", "personalization"),
        ("workflow", "workflow redesign"),
        ("policy", "context-rich prompting"),
        ("motivation", "motivation"),
        ("research design", "research-first approach"),
    ]
    for needle, label in rules:
        if needle in haystack:
            themes.append(label)
    return list(dict.fromkeys(themes))[:5]


def summarize(paragraphs):
    useful = [p for p in paragraphs if len(p) > 40 and not re.match(r"^Key lessons included", p, re.IGNORECASE)]
    return " ".join(useful[:2])[:500].strip()


def to_browser_use_cases(record):
    joined = f"{record['title']} {' '.join(record['categories'])} {record['summary']}".lower()
    labels = []
    if re.search(r"(teaching|learning|student support|revision|feedback|accessibility|clinical communication)", joined):
        labels.append("Teaching, Learning & Assessment")
    if re.search(r"(research workflow|digital humanities|bias auditing|transcription|ocr and extraction)", joined):
        labels.append("Research & Scholarship")
    if re.search(r"(communications|draft review|policy implementation|information management|grants administration|process improvement|workflow improvement)", joined):
        labels.append("Administration & Operations")
    if re.search(r"(coding support|prototype|prototyping|python|javascript|tool|builder)", joined):
        labels.append("Coding, Automation & Tool Building")
    if re.search(r"(survey analysis|analytics|draft review|feedback|decision|review)", joined):
        labels.append("Analysis, Review & Decision Support")
    if re.search(r"(communication|newsletter|writing|translation|podcast|draft|content)", joined):
        labels.append("Writing, Communication & Content")
    if re.search(r"(search|knowledge|manuscript|ecological data|reading list|guide bot|discover|catalogue)", joined):
        labels.append("Search, Knowledge Access & Discovery")
    return list(dict.fromkeys(labels))[:3]


def to_browser_ai_roles(record):
    joined = f"{record['title']} {record['summary']} {' '.join(record['source_paragraphs'])}".lower()
    labels = []
    if re.search(r"(socratic|tutor|coach|student|revision|practice|simulated patient)", joined):
        labels.append("Tutoring & Coaching")
    if re.search(r"(draft|rewrite|editing|summary|newsletter|communication|podcast|translation)", joined):
        labels.append("Drafting & Editing")
    if re.search(r"(analy|review|feedback|critical friend|evaluate|survey|insight)", joined):
        labels.append("Analysis & Review")
    if re.search(r"(code|coding|build|prototype|pipeline|app|bot|tool|automation)", joined):
        labels.append("Coding & Building")
    if re.search(r"(guide bot|reading list|search|catalogue|knowledge|question|assistant)", joined):
        labels.append("Search & Knowledge")
    if re.search(r"(workflow|process|scale|automated|batch|self-service)", joined):
        labels.append("Workflow Automation")
    return list(dict.fromkeys(labels))[:3]


def to_browser_audience(record):
    joined = f"{record['title']} {record['summary']} {' '.join(record['source_paragraphs'])}".lower()
    labels = []
    if re.search(r"(student|undergraduate|postgraduate|foundation year|learner)", joined):
        labels.append("Students")
    if re.search(r"(teacher|teaching|educator|tutor|classroom|course)", joined):
        labels.append("Educators")
    if re.search(r"(research|researcher|manuscript|scholarship|qualitative)", joined):
        labels.append("Researchers")
    if record["sector"] == "AI in Professional Services" or re.search(r"(staff|departmental|stakeholder|policy|administrative)", joined):
        labels.append("Professional Services Staff")
    if not labels:
        if record["sector"] == "AI in Education":
            labels.append("Educators")
        elif record["sector"] == "AI in Research":
            labels.append("Researchers")
        else:
            labels.append("Professional Services Staff")
    return list(dict.fromkeys(labels))[:3]


def to_browser_guardrails(record):
    joined = f"{record['summary']} {' '.join(record['source_paragraphs'])}".lower()
    labels = []
    if re.search(r"(check|checked|review|reviewed|human eyes|quality assurance|human in the loop|verify)", joined):
        labels.append("Human review required")
    if re.search(r"(accuracy|hallucinat|mistake|incorrect|outdated|limitations|not reliable)", joined):
        labels.append("Accuracy limitations")
    if re.search(r"(privacy|secure|sensitive|gdpr|data privacy|information security)", joined):
        labels.append("Privacy or security sensitive")
    if re.search(r"(academic integrity|pedagogical|shortcut|own thinking|assessment|trust the output)", joined):
        labels.append("Pedagogical or integrity concerns")
    return list(dict.fromkeys(labels))[:3]


def collect_links(landing):
    """Discover all case study URLs from paginated landing pages."""
    links = set()
    slug_prefix = landing["slug_prefix"]
    escaped = re.escape(slug_prefix)
    pattern = re.compile(escaped + r"[a-z0-9-]+")
    stagnant = 0

    for page in range(1, 13):
        url = f"{landing['url']}?page={page}"
        page_html = fetch_with_retry(url, retries=2)
        if not page_html:
            break
        matches = pattern.findall(page_html)
        page_links = set(f"{BASE_URL}{m}" for m in matches)
        before = len(links)
        links.update(page_links)
        if len(links) == before:
            stagnant += 1
        else:
            stagnant = 0
        if stagnant >= 2:
            break

    return sorted(links)


def extract_case_study(sector, url):
    """Fetch and parse a single case study page."""
    page_html = fetch_with_retry(url, retries=2)
    if not page_html:
        return None

    title_match = re.search(r'<h1 class="profilebanner-name">([\s\S]*?)</h1>', page_html)
    intro_match = re.search(r'<p class="casestudypage-intro[^"]*">([\s\S]*?)</p>', page_html)
    block_match = re.search(r'<div class="usercontent">([\s\S]*?)</div>\s*</div>\s*</div>', page_html)

    title = decode_text(title_match.group(1)) if title_match else url.rstrip("/").split("/")[-1]
    intro = decode_text(intro_match.group(1)) if intro_match else ""
    block = block_match.group(1) if block_match else ""

    paragraphs = []
    for m in re.finditer(r"<(p|li)[^>]*>([\s\S]*?)</\1>", block):
        text = decode_text(m.group(2))
        if text and not re.match(r"^Should you wish to discuss", text, re.IGNORECASE):
            paragraphs.append(text)

    contributor_info = extract_contributor_info(intro, paragraphs)

    record = {
        "title": title,
        "sector": sector,
        "url": url,
        "contributor_line": contributor_info["contributor_line"],
        "people": contributor_info["people"],
        "tools": title_to_tools(title, paragraphs),
        "categories": title_to_categories(title, paragraphs, sector),
        "key_themes": title_to_themes(title, paragraphs),
        "summary": summarize(paragraphs),
        "source_paragraphs": paragraphs,
    }

    record["browser_use_cases"] = to_browser_use_cases(record)
    record["browser_ai_roles"] = to_browser_ai_roles(record)
    record["browser_audience"] = to_browser_audience(record)
    record["browser_guardrails"] = to_browser_guardrails(record)

    return record


def main():
    all_records = []

    for landing in LANDING_PAGES:
        log(f"Collecting links from: {landing['sector']} ({landing['url']})")
        links = collect_links(landing)
        log(f"  Found {len(links)} case study links")

        for link in links:
            record = extract_case_study(landing["sector"], link)
            if record:
                all_records.append(record)
                log(f"  OK: {record['title']}")
            else:
                log(f"  FAIL: {link}")

    if not all_records:
        log("ERROR: Zero case studies parsed — aborting")
        sys.exit(1)

    all_records.sort(key=lambda r: (r["sector"], r["title"]))

    output = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source_url": "https://oerc.ox.ac.uk/ai-centre/projects/case-studies",
        "case_studies": all_records,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    log(f"Wrote {len(all_records)} case studies to {OUTPUT_FILE}")
    log("Done.")


if __name__ == "__main__":
    main()
