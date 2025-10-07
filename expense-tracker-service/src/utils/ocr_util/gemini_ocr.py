import base64
import os
import requests
import json
import argparse
from typing import Optional, Dict, Any
from PIL import Image
import pytesseract


# --- CONFIG ---
MODEL = "models/gemini-2.5-pro"

# --- EXPENSE CATEGORIES ---
EXPENSE_SUBCLASSES = [
    'food_dining',
    'groceries',
    'rent',
    'mortgage',
    'utilities',
    'transportation',
    'fuel',
    'entertainment',
    'shopping',
    'healthcare',
    'insurance',
    'education',
    'travel',
    'gym_fitness',
    'subscriptions',
    'phone_internet',
    'clothing',
    'personal_care',
    'home_maintenance',
    'investments',
    'loans',
    'taxes',
    'charity_donations',
    'gifts_given',
    'business_expenses',
    'other_expenses'
]


def load_api_key(env_path: str = '.env') -> Optional[str]:
    """Load GEMINI_API_KEY from the environment or a .env file."""
    key = os.getenv('GEMINI_API_KEY')
    if key:
        return key
    
    # Get the directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_file_path = os.path.join(script_dir, '.env')
    
    # Try .env in the same directory as this script
    if os.path.exists(env_file_path):
        with open(env_file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GEMINI_API_KEY'):
                    parts = line.split('=', 1)
                    if len(parts) == 2:
                        return parts[1].strip().strip('"')
    return None


def encode_image(image_path: str) -> str:
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def post_to_gemini(api_key: str, payload: Dict[str, Any], timeout: int = 30) -> Optional[Dict[str, Any]]:
    url = f"https://generativelanguage.googleapis.com/v1beta/{MODEL}:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        if resp.status_code != 200:
            print(f"Gemini API error: status={resp.status_code}")
            print(resp.text)
            return None
        return resp.json()
    except requests.exceptions.RequestException as e:
        print("Gemini request failed:", repr(e))
        return None


def extract_text_from_response(body: Dict[str, Any]) -> Optional[str]:
    candidates = body.get('candidates', [])
    if not candidates:
        return None
    try:
        return candidates[0]['content']['parts'][0]['text']
    except Exception:
        return None


def extract_json_from_text(t: str) -> Optional[Dict[str, Any]]:
    t = t.strip()
    # try fence removal
    if t.startswith('```') and '```' in t[3:]:
        start = t.find('{')
        end = t.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = t[start:end+1]
            try:
                return json.loads(candidate)
            except Exception:
                pass
    # try first JSON object
    start = t.find('{')
    end = t.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = t[start:end+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass
    # direct parse
    try:
        return json.loads(t)
    except Exception:
        return None


def is_valid_category(c: Any) -> bool:
    return isinstance(c, str) and c in EXPENSE_SUBCLASSES


def parsed_has_item_categories(p: Dict[str, Any]) -> bool:
    items = p.get('items') or []
    if not isinstance(items, list):
        return False
    for it in items:
        if not is_valid_category(it.get('category')):
            return False
    return True


def ensure_categories(obj: Dict[str, Any], source: str, reason: str) -> Dict[str, Any]:
    changed = False
    items = obj.get('items') or []
    for it in items:
        if not is_valid_category(it.get('category')):
            it['category'] = 'other_expenses'
            changed = True
    if not is_valid_category(obj.get('category')):
        obj['category'] = 'other_expenses'
        changed = True
    obj.setdefault('category_source', source)
    obj.setdefault('category_reason', reason if not changed else (obj.get('category_reason') or reason + '; normalized to other_expenses'))
    return obj


def build_initial_payload(image_base64: str) -> Dict[str, Any]:
    categories_text = ", ".join(EXPENSE_SUBCLASSES)
    prompt = (
        "You will be given an image (inline). Extract structured receipt data and"
        " return a single JSON object (no explanatory text) with the following fields:\n"
        "- merchant (string)\n- date (ISO or obvious string)\n- items: list of {name, qty, price, category}\n"
        "- total (raw total from receipt if present)\n- amount_paid (final numeric amount paid)\n"
        "- category (choose exactly one from the allowed list)\n\n"
        f"The allowed categories are: {categories_text}.\n"
        "For EACH item include a 'category' field whose value is exactly one of the allowed categories.\n"
        "Also choose the most suitable single overall 'category' for this transaction from the same allowed list.\n"
        "Respond ONLY with valid JSON. If you return text, ensure it is valid JSON; do not wrap in markdown."
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/png", "data": image_base64}},
                ]
            }
        ]
    }
    return payload


def reprompt_for_full_categories(api_key: str, parsed: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    prompt = (
        "You will be given a parsed receipt JSON object. Return a single JSON object"
        " that is the same receipt but with each item extended to include a 'category' field"
        " (value must be exactly one of the allowed categories) and with the top-level 'category'"
        " set to the most appropriate single category (also from the allowed list). Do NOT include any text"
        " outside the JSON.\n\nAllowed categories: " + ", ".join(EXPENSE_SUBCLASSES) + "\n\n"
        "Here is the parsed receipt JSON:\n" + json.dumps(parsed, indent=2) + "\n\n"
        "Respond only with a valid JSON object. Example output shape:\n"
        "{\"merchant\":..., \"items\":[{\"name\":..., \"qty\":..., \"price\":..., \"category\":\"groceries\"}], \"category\":\"groceries\"}"
    )
    payload2 = {"contents": [{"parts": [{"text": prompt}] }]}
    body2 = post_to_gemini(api_key, payload2, timeout=25)
    if not body2:
        return None
    text2 = extract_text_from_response(body2)
    if not text2:
        return None
    extracted = extract_json_from_text(text2)
    if not isinstance(extracted, dict):
        return None
    if is_valid_category(extracted.get('category')) and parsed_has_item_categories(extracted):
        return extracted
    return None


def fallback_local_categories(parsed: Dict[str, Any]) -> Dict[str, Any]:
    merchant = (parsed.get('merchant') or '').lower()
    merchant_map = {
        'walmart': 'groceries',
        'whole foods': 'groceries',
        'aldi': 'groceries',
        'costco': 'groceries',
        'apple': 'shopping',
        'uber': 'transportation',
        'lyft': 'transportation',
    }
    fallback_category = 'other_expenses'
    for k, v in merchant_map.items():
        if k in merchant:
            fallback_category = v
            break
    items = parsed.get('items') or []
    for it in items:
        if not is_valid_category(it.get('category')):
            it['category'] = fallback_category
    parsed['category'] = fallback_category
    parsed['category_source'] = 'local_fallback'
    parsed['category_reason'] = 'merchant fallback or defaulted to other_expenses'
    return ensure_categories(parsed, parsed.get('category_source'), parsed.get('category_reason'))


def fallback_tesseract(image_path: str) -> str:
    img = Image.open(image_path)
    return pytesseract.image_to_string(img)


def process_image(api_key: str, image_path: str) -> Optional[Dict[str, Any]]:
    image_base64 = encode_image(image_path)
    payload = build_initial_payload(image_base64)
    body = post_to_gemini(api_key, payload, timeout=30)
    if not body:
        return None
    text = extract_text_from_response(body)
    if not text:
        return None
    parsed = extract_json_from_text(text)
    if not isinstance(parsed, dict):
        return {'raw_text': text}

    # accept if valid
    if is_valid_category(parsed.get('category')) and parsed_has_item_categories(parsed):
        parsed['category_source'] = 'gemini'
        parsed['category_reason'] = 'model returned valid overall and per-item categories'
        return ensure_categories(parsed, parsed.get('category_source'), parsed.get('category_reason'))

    # reprompt
    rep = reprompt_for_full_categories(api_key, parsed)
    if rep is not None:
        rep['category_source'] = 'reprompt'
        rep['category_reason'] = 'reprompted model returned per-item and overall categories'
        return ensure_categories(rep, rep.get('category_source'), rep.get('category_reason'))

    # fallback local
    return fallback_local_categories(parsed)


def main():
    parser = argparse.ArgumentParser(description='Receipt OCR + categorization using Gemini')
    parser.add_argument('image', nargs='?', help='Path to receipt image')
    parser.add_argument('--save', '-s', help='Path to save JSON output')
    args = parser.parse_args()

    api_key = load_api_key()
    if not api_key:
        print('No GEMINI_API_KEY found in environment or .env')
        return

    image_path = args.image
    if not image_path:
        try:
            image_path = input('Enter path to receipt image: ').strip()
        except EOFError:
            print('No image path provided. Exiting.')
            return
    if not image_path:
        print('No image path provided. Exiting.')
        return

    result = process_image(api_key, image_path)
    if result is None:
        print('Failed to get a response from Gemini; falling back to Tesseract output:')
        print(fallback_tesseract(image_path))
        return

    out = json.dumps(result, indent=2)
    print(out)
    if args.save:
        with open(args.save, 'w') as f:
            f.write(out)
        print(f'Saved output to {args.save}')


if __name__ == '__main__':
    main()
