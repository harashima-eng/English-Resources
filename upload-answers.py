#!/usr/bin/env python3
"""One-time script: Extract answer data from Dual Scope lesson HTML files
and upload to Firebase Realtime Database.

Usage:
  1. Temporarily set /answers write rules to true in database.rules.json
  2. Deploy: firebase deploy --only database
  3. Run: python3 upload-answers.py
  4. Restore write rules to teacher-only
  5. Deploy again: firebase deploy --only database

Or run with --dry-run to just extract and print the data without uploading.
"""

import json
import re
import sys
import urllib.request

FIREBASE_DB_URL = "https://english-resources-reveal-default-rtdb.firebaseio.com"

LESSONS = [
    {
        "file": "高校２年/論理・表現II/Dual Scope/Lesson 15｜接続詞.html",
        "examId": "ds-lesson15-conjunctions",
    },
    {
        "file": "高校２年/論理・表現II/Dual Scope/Lesson 16｜名詞・冠詞・代名詞.html",
        "examId": "ds-lesson16-nouns-articles",
    },
    {
        "file": "高校２年/論理・表現II/Dual Scope/Lesson 17｜形容詞・副詞・群動詞.html",
        "examId": "ds-lesson17-adjectives-adverbs",
    },
]

ANSWER_FIELDS = ["answer", "translation", "explanation", "grammar", "choiceExplanations"]


def extract_grammar_data(html_content):
    """Extract the grammarData JavaScript object from HTML content."""
    # Find the grammarData block
    match = re.search(r'const grammarData\s*=\s*\{', html_content)
    if not match:
        return None

    start = match.start() + len("const grammarData = ")

    # Find matching closing brace by counting braces
    depth = 0
    i = start
    while i < len(html_content):
        ch = html_content[i]
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                break
        elif ch == '"' or ch == "'":
            # Skip string contents
            quote = ch
            i += 1
            while i < len(html_content) and html_content[i] != quote:
                if html_content[i] == '\\':
                    i += 1  # skip escaped char
                i += 1
        elif ch == '`':
            # Skip template literal
            i += 1
            while i < len(html_content) and html_content[i] != '`':
                if html_content[i] == '\\':
                    i += 1
                i += 1
        i += 1

    js_obj = html_content[start:i + 1]

    # Convert JS object to valid JSON
    # Add quotes around unquoted keys
    js_obj = re.sub(r'(?<=[{,\n])\s*(\w+)\s*:', r' "\1":', js_obj)
    # Replace single quotes with double quotes (outside of strings)
    # Handle HTML entities in strings by not touching content inside quotes
    # Replace trailing commas before } or ]
    js_obj = re.sub(r',\s*([}\]])', r'\1', js_obj)

    try:
        data = json.loads(js_obj)
        return data
    except json.JSONDecodeError:
        return None


def extract_grammar_data_v2(html_content):
    """Alternative extraction: use regex to find each question block."""
    sections = []

    # Find all section blocks
    section_pattern = re.compile(
        r'title:\s*["\'](.+?)["\'].*?questions:\s*\[',
        re.DOTALL
    )

    # Find grammarData block
    gd_match = re.search(r'const grammarData\s*=\s*\{[\s\S]*?sections:\s*\[', html_content)
    if not gd_match:
        return None

    gd_start = gd_match.end()

    # Find the end of sections array
    gd_end_match = re.search(r'\n\s*\]\s*\n\s*\};', html_content[gd_start:])
    if not gd_end_match:
        return None

    sections_text = html_content[gd_start:gd_start + gd_end_match.start() + gd_end_match.end()]

    # Split into section blocks
    section_splits = re.split(r'\{\s*\n\s*title:', sections_text)

    result_sections = []
    for sec_text in section_splits[1:]:  # skip first empty split
        questions = []

        # Find each question object
        q_splits = re.split(r'\{\s*\n\s*num:', sec_text)

        for q_text in q_splits[1:]:  # skip first (section header)
            q_data = {}

            # Extract answer fields using regex
            for field in ANSWER_FIELDS:
                if field == "choiceExplanations":
                    # Special handling for object
                    ce_match = re.search(
                        r'choiceExplanations:\s*\{([\s\S]*?)\}',
                        q_text
                    )
                    if ce_match:
                        ce_text = ce_match.group(1)
                        ce_dict = {}
                        # Parse key-value pairs
                        for kv in re.finditer(
                            r'["\'](.+?)["\']\s*:\s*["\'](.+?)["\']',
                            ce_text
                        ):
                            ce_dict[kv.group(1)] = kv.group(2)
                        if ce_dict:
                            q_data["choiceExplanations"] = ce_dict
                else:
                    # Simple string field
                    pat = re.compile(
                        rf'{field}:\s*["\'](.+?)["\']',
                        re.DOTALL
                    )
                    m = pat.search(q_text)
                    if m:
                        val = m.group(1)
                        # Unescape
                        val = val.replace("\\'", "'").replace('\\"', '"')
                        q_data[field] = val

            questions.append(q_data)

        result_sections.append(questions)

    return result_sections


def extract_with_node(filepath):
    """Use Node.js to safely parse the grammarData JavaScript object."""
    import subprocess
    import tempfile

    # Read the HTML file
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract just the grammarData assignment
    match = re.search(r'(const grammarData\s*=\s*\{[\s\S]*?\n\};)', content)
    if not match:
        return None

    js_code = match.group(1)

    # Create a Node.js script that evaluates grammarData and extracts answer fields
    node_script = js_code + """
const result = {};
grammarData.sections.forEach((sec, si) => {
  result[si] = {};
  sec.questions.forEach((q, qi) => {
    const answerData = {};
    if (q.answer !== undefined) answerData.answer = q.answer;
    if (q.translation !== undefined) answerData.translation = q.translation;
    if (q.explanation !== undefined) answerData.explanation = q.explanation;
    if (q.grammar !== undefined) answerData.grammar = q.grammar;
    if (q.choiceExplanations !== undefined) {
      // Firebase keys can't contain dots - replace . with fullwidth period
      const sanitized = {};
      for (const [k, v] of Object.entries(q.choiceExplanations)) {
        sanitized[k.replace(/\\./g, '\\uff0e')] = v;
      }
      answerData.choiceExplanations = sanitized;
    }
    result[si][qi] = answerData;
  });
});
process.stdout.write(JSON.stringify(result));
"""

    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(node_script)
        tmp_path = f.name

    try:
        proc = subprocess.run(
            ['node', tmp_path],
            capture_output=True, text=True, timeout=10
        )
        if proc.returncode != 0:
            print(f"  Node.js error: {proc.stderr[:200]}")
            return None
        return json.loads(proc.stdout)
    except Exception as e:
        print(f"  Node.js extraction failed: {e}")
        return None
    finally:
        import os
        os.unlink(tmp_path)


def upload_to_firebase(exam_id, data, dry_run=False):
    """Upload answer data to Firebase Realtime Database."""
    url = f"{FIREBASE_DB_URL}/answers/{exam_id}.json"
    payload = json.dumps(data).encode('utf-8')

    if dry_run:
        print(f"  [DRY RUN] Would PUT {len(payload)} bytes to {url}")
        return True

    req = urllib.request.Request(url, data=payload, method='PUT')
    req.add_header('Content-Type', 'application/json')

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                print(f"  Uploaded to {url}")
                return True
            else:
                print(f"  Upload failed: HTTP {resp.status}")
                return False
    except Exception as e:
        print(f"  Upload error: {e}")
        return False


def main():
    import os
    dry_run = '--dry-run' in sys.argv
    base_dir = os.path.dirname(os.path.abspath(__file__))

    if dry_run:
        print("=== DRY RUN MODE ===\n")

    for lesson in LESSONS:
        filepath = os.path.join(base_dir, lesson["file"])
        exam_id = lesson["examId"]

        print(f"Processing: {lesson['file']}")
        print(f"  Exam ID: {exam_id}")

        if not os.path.exists(filepath):
            print(f"  ERROR: File not found!")
            continue

        # Extract answer data using Node.js (most reliable for JS parsing)
        data = extract_with_node(filepath)
        if not data:
            print("  ERROR: Could not extract grammarData!")
            continue

        # Count questions
        total_q = sum(len(qs) for qs in data.values())
        print(f"  Extracted: {len(data)} sections, {total_q} questions")

        # Show sample
        first_sec = data.get("0", data.get(0, {}))
        first_q = first_sec.get("0", first_sec.get(0, {}))
        if first_q:
            print(f"  Sample answer: {first_q.get('answer', 'N/A')[:50]}")

        # Upload
        if upload_to_firebase(exam_id, data, dry_run):
            print(f"  OK")
        else:
            print(f"  FAILED")

        print()

    print("Done!")
    if dry_run:
        print("Run without --dry-run to actually upload to Firebase.")


if __name__ == '__main__':
    main()
