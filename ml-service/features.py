import re
import math
import json
from typing import Dict, Any, Union, List
from urllib.parse import unquote, urlparse

SPECIAL_CHARS = ["'", '"', '<', '>', ';', '--', '|', '&', '$', '%', '`']

SQLI_PATTERNS = [
    r'union\s+select',
    r"or\s+['\"]?[a-zA-Z0-9]+['\"]?\s*=\s*['\"]?[a-zA-Z0-9]+",
    r'select\s+.*from',
    r'information_schema',
    r"'--",
    r'--',
    r'drop\s+table',
    r'order\s+by',
    r'group\s+by',
    r'having\s+',
    r'xp_cmdshell',
    r'exec\s*\(',
    r';\s*select',
    r'/\*.*?\*/',           # comment obfuscation  /**/
    r'0x[0-9a-f]+',         # hex encoding
    r'char\s*\(',
    r'convert\s*\(',
    r'sleep\s*\(',
    r'benchmark\s*\(',
]

XSS_PATTERNS = [
    r'<script[^>]*>',
    r'javascript\s*:',
    r'onerror\s*=',
    r'onload\s*=',
    r'document\.cookie',
    r'eval\s*\(',
    r'alert\s*\(',
    r'<iframe',
    r'<img[^>]+src\s*=',
    r'expression\s*\(',
    r'vbscript\s*:',
    r'data\s*:\s*text/html',
]

CMD_PATTERNS = [
    r';\s*(/bin/)?(cat|rm|ls|id|uname|whoami|wget|curl|python|perl|bash|sh)\b',
    r'\|\s*(/bin/)?(cat|rm|ls|id|uname|whoami|wget|curl|python|perl|bash|sh)\b',
    r'cat\s+/etc',
    r'/etc/(passwd|shadow|hosts|environ)',
    r'/proc/self',
    r'`',
    r'\$\(',
    r'wget\s+',
    r'curl\s+',
    r'whoami\b',
    r'nc\s+-',              # netcat reverse shell
    r'python[0-9]?\s+-c',
    r'perl\s+-e',
]


_METHOD_LIST = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']


def _iterative_unquote(s: str, max_passes: int = 3) -> str:
    """Decode percent-encoding iteratively until stable (cap at max_passes)."""
    for _ in range(max_passes):
        decoded = unquote(s)
        if decoded == s:
            break
        s = decoded
    return s


def _shannon_entropy(s: str) -> float:
    """Shannon entropy of a string (bits per character)."""
    if not s:
        return 0.0
    freq: Dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    n = len(s)
    return -sum((count / n) * math.log2(count / n) for count in freq.values())


def _method_onehot(method: str) -> Dict[str, float]:
    m = (method or 'get').lower()
    return {f'method_{mv}': float(m == mv) for mv in _METHOD_LIST}


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
    url_str = _iterative_unquote(url or '')
    body_str = _iterative_unquote(body or '')
    combined_str = (url_str + ' ' + body_str).lower()

    # 1. Length features
    url_length = len(url_str)
    body_length = len(body_str)

    # 2. Path features
    try:
        parsed = urlparse(url_str)
        path_segments = [s for s in parsed.path.split('/') if s]
        path_segment_count = len(path_segments)
        query_str = parsed.query
    except Exception:
        path_segment_count = 0
        query_str = ''

    # 3. Ratio / entropy features (scale-invariant)
    total_len = len(combined_str) or 1
    non_alnum_count = sum(1 for c in combined_str if not c.isalnum() and c != ' ')
    non_alnum_ratio = non_alnum_count / total_len
    entropy_query = _shannon_entropy(query_str)
    encoded_sequence_count = len(re.findall(r'%[0-9a-fA-F]{2}', (url or '') + (body or '')))

    # 4. Special character count
    special_char_count = sum(combined_str.count(char) for char in SPECIAL_CHARS)

    # 5. Pattern matching
    sqli_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in SQLI_PATTERNS)
    xss_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in XSS_PATTERNS)
    cmd_pattern_count = sum(len(re.findall(pat, combined_str)) for pat in CMD_PATTERNS)

    # 6. Header count
    header_count = parse_header_count(headers)

    # 7. Method one-hot
    method_onehot = _method_onehot(method)

    feat: Dict[str, Any] = {
        'url_length': url_length,
        'body_length': body_length,
        'path_segment_count': path_segment_count,
        'non_alnum_ratio': non_alnum_ratio,
        'entropy_query': entropy_query,
        'encoded_sequence_count': encoded_sequence_count,
        'special_char_count': special_char_count,
        'sqli_pattern_count': sqli_pattern_count,
        'xss_pattern_count': xss_pattern_count,
        'cmd_pattern_count': cmd_pattern_count,
        'header_count': header_count,
    }
    feat.update(method_onehot)
    return feat


FEATURE_COLUMNS = [
    'url_length',
    'body_length',
    'path_segment_count',
    'non_alnum_ratio',
    'entropy_query',
    'encoded_sequence_count',
    'special_char_count',
    'sqli_pattern_count',
    'xss_pattern_count',
    'cmd_pattern_count',
    'header_count',
    'method_get',
    'method_post',
    'method_put',
    'method_delete',
    'method_patch',
    'method_head',
    'method_options',
]


def extract_feature_vector(method: str, url: str, headers: Union[str, dict, None], body: str) -> List[float]:
    feat = extract_features_dict(method, url, headers, body)
    return [float(feat[col]) for col in FEATURE_COLUMNS]
