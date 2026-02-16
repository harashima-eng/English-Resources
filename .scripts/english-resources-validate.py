#!/usr/bin/env python3
"""
Content validator for Dual Scope lesson files.
Checks for answer-leaking vocab/hints, missing fields, and structural issues.

Usage:
    python3 english-resources-validate.py                    # validate all lessons
    python3 english-resources-validate.py path/to/lesson.html  # validate one file
"""

import re
import sys
import os
import json

REPO_DIR = "/Users/slimtetto/Projects/English-Resources"
DUAL_SCOPE_DIR = os.path.join(REPO_DIR, "高校２年/論理・表現II/Dual Scope")
MAX_HTML_SIZE = 200 * 1024  # 200KB

# ANSI colors
RED = "\033[91m"
YELLOW = "\033[93m"
GREEN = "\033[92m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def extract_grammar_data_text(html_content):
    """Extract the raw grammarData block from HTML as a string."""
    # Find the block between 'const grammarData = {' and '};' before navigation state
    match = re.search(
        r'const grammarData\s*=\s*(\{.*?\n\});',
        html_content,
        re.DOTALL
    )
    if not match:
        return None
    return match.group(1)


def js_to_json(js_text):
    """Convert JavaScript object notation to valid JSON."""
    text = js_text

    # Remove single-line comments (but not inside strings)
    text = re.sub(r'//[^\n]*', '', text)

    # Remove multi-line comments
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)

    # Quote unquoted keys: word: -> "word":
    # Match keys that aren't already quoted
    text = re.sub(r'(?<=[{,\n])\s*(\w+)\s*:', r' "\1":', text)

    # Remove trailing commas before } or ]
    text = re.sub(r',\s*([}\]])', r'\1', text)

    # Handle single-quoted strings -> double-quoted
    # This is tricky; skip if all strings are already double-quoted
    # (Dual Scope files use double quotes)

    return text


def parse_grammar_data(html_content):
    """Parse grammarData from HTML content into a Python dict."""
    raw = extract_grammar_data_text(html_content)
    if raw is None:
        return None, "Could not find grammarData block"

    json_text = js_to_json(raw)

    try:
        data = json.loads(json_text)
        return data, None
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}"


def is_sentence_answer(answer_str):
    """Check if the answer is a full sentence/phrase (並べかえ/英作文 style)."""
    clean = re.sub(r'^[a-d]\.\s*', '', answer_str.strip())
    # Sentence answers typically have 4+ words or contain punctuation
    word_count = len(clean.split())
    return word_count >= 4


# Common words that appear everywhere — not useful as leak indicators
COMMON_WORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "can",
    "could", "should", "may", "might", "shall", "must", "to", "of", "in",
    "on", "at", "by", "for", "with", "from", "as", "it", "its", "that",
    "this", "not", "no", "so", "if", "or", "and", "but", "i", "he", "she",
    "we", "they", "you", "me", "him", "her", "us", "them", "my", "his",
    "our", "your", "their"
}


def extract_answer_words(answer_str):
    """Extract the meaningful answer words from an answer string.

    For short answers (語句選択, 空所補充): returns key words/phrases.
    For sentence answers (並べかえ, 英作文): returns only the key grammar
    phrase, not every word.
    """
    answer = answer_str.strip()

    # Remove letter prefix like "a. ", "d. "
    answer = re.sub(r'^[a-d]\.\s*', '', answer)

    # Handle correction format "X → Y" (take the correction Y)
    if '→' in answer:
        answer = answer.split('→')[-1].strip()

    # For sentence answers, don't return individual common words
    if is_sentence_answer(answer):
        return [answer.lower().strip()]

    # Split on comma for multi-word answers like "both, and"
    words = [w.strip().lower() for w in answer.split(',') if w.strip()]

    # Also keep the full phrase for multi-word matching
    full = answer.lower().strip()
    if full and full not in words:
        words.append(full)

    return words


def check_vocab_leaks(question, section_title):
    """Check if any vocab entry contains the answer word/phrase."""
    issues = []
    answer = question.get("answer", "")
    vocab = question.get("vocab", [])
    question_text = question.get("text", "")
    num = question.get("num", "?")

    if not answer or not vocab:
        return issues

    sentence_answer = is_sentence_answer(answer)
    answer_words = extract_answer_words(answer)

    for entry in vocab:
        if not isinstance(entry, list) or len(entry) < 2:
            continue
        vocab_word = entry[0].lower()
        vocab_word_plain = re.sub(r'[^\w\s]', '', vocab_word).strip()

        # Skip common words that match incidentally
        if vocab_word_plain in COMMON_WORDS:
            continue

        for aw in answer_words:
            if not aw:
                continue

            if sentence_answer:
                # For sentence answers (並べかえ/英作文):
                # Only flag if vocab teaches a multi-word GRAMMAR PHRASE
                # (connectors, idioms, structural patterns) not content words.

                if len(vocab_word_plain.split()) < 2:
                    continue  # Single words in sentence answers aren't leaks

                # Multi-word vocab phrase — is it a grammar pattern or content?
                # Grammar patterns: "so that", "not until", "in case", "by the time",
                # "of no value", "as far as", etc.
                # Content phrases: "human beings", "last night", "nice day", etc.
                # Heuristic: grammar patterns contain function words
                function_words = {"so", "not", "no", "in", "by", "as", "of",
                                  "such", "both", "either", "neither", "nor",
                                  "whether", "until", "unless", "once", "that"}
                phrase_words = set(vocab_word_plain.split())
                has_function_word = bool(phrase_words & function_words)

                if has_function_word and vocab_word_plain in aw:
                    issues.append({
                        "type": "vocab_leak",
                        "severity": "HIGH",
                        "question": num,
                        "section": section_title,
                        "detail": f"Vocab '{entry[0]}' teaches grammar pattern from answer"
                    })
            else:
                # Short answer (語句選択, 空所補充, etc.)
                # Skip very short common words
                if aw in COMMON_WORDS:
                    continue

                # Use word boundary matching to avoid substring false positives
                if re.search(r'\b' + re.escape(aw) + r'\b', vocab_word):
                    issues.append({
                        "type": "vocab_leak",
                        "severity": "HIGH",
                        "question": num,
                        "section": section_title,
                        "detail": f"Vocab '{entry[0]}' contains answer '{aw}'"
                    })
                elif re.search(r'\b' + re.escape(vocab_word_plain) + r'\b', aw):
                    issues.append({
                        "type": "vocab_leak",
                        "severity": "HIGH",
                        "question": num,
                        "section": section_title,
                        "detail": f"Vocab '{entry[0]}' matches answer '{aw}'"
                    })

    return issues


def check_hint_leaks(question, section_title):
    """Check if any hint directly states the answer."""
    issues = []
    answer = question.get("answer", "")
    hints = question.get("hint", [])
    num = question.get("num", "?")

    if not answer or not hints:
        return issues

    # For short answers, extract the key word(s)
    clean_answer = re.sub(r'^[a-d]\.\s*', '', answer.strip())

    # For sentence answers, extract the distinctive grammar phrase
    if is_sentence_answer(answer):
        # Don't check sentence answers against hints — too many false positives
        # Hints guide thinking, and sentence answers contain too many common words
        return issues

    # Split answer for multi-part answers like "both, and"
    answer_parts = [w.strip().lower() for w in clean_answer.split(',') if w.strip()]
    # Also check full phrase
    full_answer = clean_answer.lower().strip()
    if full_answer not in answer_parts:
        answer_parts.append(full_answer)

    for i, hint in enumerate(hints):
        hint_lower = hint.lower()
        for aw in answer_parts:
            if not aw or aw in COMMON_WORDS:
                continue
            # Use word boundary for single words, substring for phrases
            if ' ' in aw:
                # Multi-word phrase — substring match is fine
                if aw in hint_lower:
                    issues.append({
                        "type": "hint_leak",
                        "severity": "HIGH",
                        "question": num,
                        "section": section_title,
                        "detail": f"Hint {i+1} states answer '{aw}': \"{hint[:60]}...\""
                    })
            else:
                # Single word — use word boundary to avoid false positives
                if re.search(r'\b' + re.escape(aw) + r'\b', hint_lower):
                    issues.append({
                        "type": "hint_leak",
                        "severity": "HIGH",
                        "question": num,
                        "section": section_title,
                        "detail": f"Hint {i+1} contains answer '{aw}': \"{hint[:60]}...\""
                    })

    return issues


def check_required_fields(question, section_title):
    """Check that all required fields are present."""
    issues = []
    num = question.get("num", "?")

    required = ["text", "answer", "translation"]
    for field in required:
        value = question.get(field)
        if not value or (isinstance(value, str) and not value.strip()):
            issues.append({
                "type": "missing_field",
                "severity": "MEDIUM",
                "question": num,
                "section": section_title,
                "detail": f"Missing required field: {field}"
            })

    # Vocab and hints are expected but not strictly required for all types
    # (e.g., translation questions may not have hints)
    if not question.get("vocab") and not question.get("hint"):
        issues.append({
            "type": "no_pedagogy",
            "severity": "LOW",
            "question": num,
            "section": section_title,
            "detail": "No vocab AND no hints (student gets no help)"
        })

    # For 並べかえ/英作文/空所補充, translation is often omitted intentionally
    # because the answer itself serves as the translation target.
    # Demote these from MEDIUM to LOW.
    section_lower = section_title.lower()
    translation_optional = any(kw in section_lower for kw in [
        "並べかえ", "英作文", "空所補充"
    ])
    if translation_optional:
        for issue in issues:
            if issue["type"] == "missing_field" and "translation" in issue["detail"]:
                issue["severity"] = "LOW"

    return issues


def check_hint_count(question, section_title):
    """Check that hints have exactly 3 entries when present."""
    issues = []
    hints = question.get("hint", [])
    num = question.get("num", "?")

    if hints and len(hints) != 3:
        issues.append({
            "type": "hint_count",
            "severity": "LOW",
            "question": num,
            "section": section_title,
            "detail": f"Expected 3 hints, found {len(hints)}"
        })

    return issues


def validate_file(filepath):
    """Validate a single lesson file. Returns list of issues."""
    filename = os.path.basename(filepath)
    issues = []

    # Check file size
    size = os.path.getsize(filepath)
    if size > MAX_HTML_SIZE:
        issues.append({
            "type": "file_size",
            "severity": "MEDIUM",
            "question": "-",
            "section": "-",
            "detail": f"File is {size // 1024}KB (limit: {MAX_HTML_SIZE // 1024}KB)"
        })

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Parse grammarData
    data, error = parse_grammar_data(content)
    if error:
        issues.append({
            "type": "parse_error",
            "severity": "HIGH",
            "question": "-",
            "section": "-",
            "detail": error
        })
        return filename, issues

    sections = data.get("sections", [])
    if not sections:
        issues.append({
            "type": "no_sections",
            "severity": "HIGH",
            "question": "-",
            "section": "-",
            "detail": "grammarData has no sections"
        })
        return filename, issues

    # Check categoryMap consistency
    cat_match = re.search(r'categoryMap:\s*\{([^}]+)\}', content)
    if cat_match:
        cat_text = cat_match.group(1)
        # Extract all section indices referenced in categoryMap
        referenced = set()
        for idx_match in re.finditer(r'\d+', cat_text):
            referenced.add(int(idx_match.group()))

        expected = set(range(len(sections)))
        if referenced != expected:
            missing = expected - referenced
            extra = referenced - expected
            detail = ""
            if missing:
                detail += f"Sections not in categoryMap: {sorted(missing)}. "
            if extra:
                detail += f"categoryMap references non-existent sections: {sorted(extra)}."
            issues.append({
                "type": "categoryMap_mismatch",
                "severity": "HIGH",
                "question": "-",
                "section": "-",
                "detail": detail.strip()
            })

    # Validate each question
    total_questions = 0
    for section in sections:
        title = section.get("title", "Unknown section")
        questions = section.get("questions", [])
        total_questions += len(questions)

        for q in questions:
            issues.extend(check_vocab_leaks(q, title))
            issues.extend(check_hint_leaks(q, title))
            issues.extend(check_required_fields(q, title))
            issues.extend(check_hint_count(q, title))

    # Summary metadata
    meta = {
        "sections": len(sections),
        "questions": total_questions,
        "size_kb": size // 1024
    }

    return filename, issues, meta


def print_report(filename, issues, meta=None):
    """Print a formatted validation report."""
    high = [i for i in issues if i["severity"] == "HIGH"]
    medium = [i for i in issues if i["severity"] == "MEDIUM"]
    low = [i for i in issues if i["severity"] == "LOW"]

    if not issues:
        print(f"\n{GREEN}{BOLD}✓ {filename}{RESET}")
        if meta:
            print(f"  {meta['sections']} sections, {meta['questions']} questions, {meta['size_kb']}KB")
        print(f"  {GREEN}All checks passed{RESET}")
        return True

    print(f"\n{RED if high else YELLOW}{BOLD}✗ {filename}{RESET}")
    if meta:
        print(f"  {meta['sections']} sections, {meta['questions']} questions, {meta['size_kb']}KB")

    print(f"  {RED}{len(high)} HIGH{RESET}  {YELLOW}{len(medium)} MEDIUM{RESET}  {len(low)} LOW")

    for issue in sorted(issues, key=lambda i: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}[i["severity"]]):
        color = RED if issue["severity"] == "HIGH" else YELLOW if issue["severity"] == "MEDIUM" else RESET
        icon = "🔴" if issue["severity"] == "HIGH" else "🟡" if issue["severity"] == "MEDIUM" else "⚪"
        loc = f"{issue['section']} {issue['question']}" if issue['question'] != '-' else issue['section']
        print(f"  {icon} {color}[{issue['type']}]{RESET} {loc}")
        print(f"     {issue['detail']}")

    return False


def main():
    files = []

    if len(sys.argv) > 1:
        # Validate specific file(s)
        for arg in sys.argv[1:]:
            if os.path.isfile(arg):
                files.append(arg)
            else:
                print(f"File not found: {arg}")
                sys.exit(1)
    else:
        # Validate all Dual Scope lesson files
        if not os.path.isdir(DUAL_SCOPE_DIR):
            print(f"Dual Scope directory not found: {DUAL_SCOPE_DIR}")
            sys.exit(1)

        for f in sorted(os.listdir(DUAL_SCOPE_DIR)):
            if f.startswith("Lesson") and f.endswith(".html"):
                files.append(os.path.join(DUAL_SCOPE_DIR, f))

    if not files:
        print("No lesson files found to validate.")
        sys.exit(1)

    print(f"{BOLD}{CYAN}Dual Scope Content Validator{RESET}")
    print(f"Checking {len(files)} file(s)...\n")

    all_passed = True
    total_issues = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}

    for filepath in files:
        result = validate_file(filepath)
        if len(result) == 3:
            filename, issues, meta = result
        else:
            filename, issues = result
            meta = None

        passed = print_report(filename, issues, meta)
        if not passed:
            all_passed = False
        for issue in issues:
            total_issues[issue["severity"]] += 1

    # Final summary
    total = sum(total_issues.values())
    print(f"\n{'─' * 50}")
    if all_passed:
        print(f"{GREEN}{BOLD}All files passed validation ✓{RESET}")
    else:
        print(f"{BOLD}Total issues: {RED}{total_issues['HIGH']} HIGH{RESET}  "
              f"{YELLOW}{total_issues['MEDIUM']} MEDIUM{RESET}  "
              f"{total_issues['LOW']} LOW{RESET}")

    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
