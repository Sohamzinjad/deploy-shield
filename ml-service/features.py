import re
import json
from typing import Dict, Any, Union, List

SPECIAL_CHARS = ['\'', '"', '<', '>', ';', '--', '|', '&', '$', '%', '`']

SQLI_PATTERNS = [
    r'union\s+select',
    r'or\s+1\s*=\s*1',
    r'select\s+.*from',
    r'information_schema',
    r'\'--',
    r'drop\s+table',
    r'exec\s*\(',
    r';\s*select'
]

XSS_PATTERNS = [
    r'<script>',
    r'javascript:',
    r'onerror\s*=',
    r'onload\s*=',
    r'document\.cookie',
    r'eval\s*\(',
    r'alert\s*\('
]

CMD_PATTERNS = [
    r';\s*rm',
    r'\|\s*bash',
    r'\|\s*sh',
    r'cat\s+/etc',
    r'`',
    r'\$\(',
    r'wget\s+',
    r'curl\s+'
]

def parse_header_count(headers: Union[str, dict, None]) -> int:
    if not headers:
        return 0
    if isinstance(headers, dict):
        return len(headers)
    if isinstance(headers, str):
        try:
            parsed = json.loads(headers)
            if isinstance(parsed, dict):
                return len(parsed)
        except Exception:
            pass
        return headers.count(':') or 1
    return 0

def extract_features_dict(method: str, url: str, headers: Union[str, dict, None], body: str) -> Dict[str, Any]:
    url_str = url or ''
    body_str = body or ''
    combined_str = (url_str + " " + body_str).lower()

    # 1. Length features
    url_length = len(url_str)
    body_length = len(body_str)

    # 2. Special character count
    special_char_count = sum(combined_str.count(char) for char in SPECIAL_CHARS)

    # 3. Substring pattern matching
    sqli_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in SQLI_PATTERNS)
    xss_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in XSS_PATTERNS)
    cmd_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in CMD_PATTERNS)

    # 4. Header count
    header_count = parse_header_count(headers)

    return {
        'url_length': url_length,
        'body_length': body_length,
        'special_char_count': special_char_count,
        'sqli_pattern_count': sqli_pattern_count,
        'xss_pattern_count': xss_pattern_count,
        'cmd_pattern_count': cmd_pattern_count,
        'header_count': header_count
    }

FEATURE_COLUMNS = [
    'url_length',
    'body_length',
    'special_char_count',
    'sqli_pattern_count',
    'xss_pattern_count',
    'cmd_pattern_count',
    'header_count'
]

def extract_feature_vector(method: str, url: str, headers: Union[str, dict, None], body: str) -> List[float]:
    feat = extract_features_dict(method, url, headers, body)
    return [float(feat[col]) for col in FEATURE_COLUMNS]
