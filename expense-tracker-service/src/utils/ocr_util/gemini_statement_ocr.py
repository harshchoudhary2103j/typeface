import base64
import os
import requests
import json
import argparse
import datetime
from typing import Optional, Dict, Any, List
import fitz  # PyMuPDF for PDF processing
import re
import sys

# --- CONFIG ---
MODEL = "models/gemini-2.5-pro"

# --- INCOME AND EXPENSE CATEGORIES ---
INCOME_SUBCLASSES = [
    'salary',
    'freelance',
    'investment_returns',
    'rental_income',
    'business_income',
    'dividends',
    'interest',
    'bonus',
    'commission',
    'pension',
    'grants',
    'gifts_received',
    'insurance_claims',
    'tax_refunds',
    'other_income'
]

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

ALL_CATEGORIES = INCOME_SUBCLASSES + EXPENSE_SUBCLASSES

def load_api_key(env_path: str = '.env') -> Optional[str]:
    """Load GEMINI_API_KEY from the environment or a .env file."""
    key = os.getenv('GEMINI_API_KEY')
    if key:
        return key
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    env_file_path = os.path.join(script_dir, '.env')
    
    if os.path.exists(env_file_path):
        with open(env_file_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line.startswith('GEMINI_API_KEY'):
                    parts = line.split('=', 1)
                    if len(parts) == 2:
                        return parts[1].strip().strip('"')
    return None

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF using PyMuPDF."""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def encode_pdf_first_page(pdf_path: str) -> str:
    """Convert first page of PDF to image and encode as base64."""
    try:
        doc = fitz.open(pdf_path)
        page = doc[0]  # First page
        pix = page.get_pixmap()
        img_data = pix.tobytes("png")
        doc.close()
        return base64.b64encode(img_data).decode('utf-8')
    except Exception as e:
        print(f"Error converting PDF to image: {e}")
        return ""

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
    
    # Remove markdown code blocks if present
    if t.startswith('```') and '```' in t[3:]:
        start = t.find('{')
        end = t.rfind('}')
        if start != -1 and end != -1 and end > start:
            candidate = t[start:end+1]
            try:
                return json.loads(candidate)
            except Exception:
                pass
    
    # Try to find JSON object
    start = t.find('{')
    end = t.rfind('}')
    if start != -1 and end != -1 and end > start:
        candidate = t[start:end+1]
        try:
            return json.loads(candidate)
        except Exception:
            pass
    
    # Direct parse
    try:
        return json.loads(t)
    except Exception:
        return None

def build_statement_prompt(pdf_text: str) -> str:
    """Build prompt for statement processing."""
    income_categories = ", ".join(INCOME_SUBCLASSES)
    expense_categories = ", ".join(EXPENSE_SUBCLASSES)
    
    prompt = f"""
You will be given a bank statement or transaction history PDF text. Extract structured transaction data and return a single JSON object with the following format:

{{
  "accountNumber": "string (account number if visible)",
  "period": "string (statement period like 'January 2024')",
  "openingBalance": "number (opening balance if visible)",
  "closingBalance": "number (closing balance if visible)",
  "transactions": [
    {{
      "date": "YYYY-MM-DD format",
      "description": "transaction description",
      "debit": "number (if expense/withdrawal)",
      "credit": "number (if income/deposit)",
      "amount": "number (absolute amount)",
      "balance": "number (running balance if visible)",
      "category": "suggested category from allowed lists",
      "confidence": "high/medium/low"
    }}
  ]
}}

INCOME CATEGORIES: {income_categories}
EXPENSE CATEGORIES: {expense_categories}

Instructions:
1. Extract ALL transactions from the statement
2. For each transaction, determine if it's income (credit) or expense (debit)
3. Suggest appropriate category from the allowed lists
4. Include running balance if visible in the statement
5. Use ISO date format (YYYY-MM-DD)
6. Return ONLY valid JSON, no additional text

Statement text:
{pdf_text[:8000]}  # Limit text to avoid token limits
"""
    return prompt

def process_statement_with_text(api_key: str, pdf_text: str) -> Optional[Dict[str, Any]]:
    """Process statement using extracted text."""
    prompt = build_statement_prompt(pdf_text)
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    
    body = post_to_gemini(api_key, payload, timeout=45)
    if not body:
        return None
    
    text = extract_text_from_response(body)
    if not text:
        return None
    
    parsed = extract_json_from_text(text)
    if not isinstance(parsed, dict):
        return None
    
    return parsed

def process_statement_with_image(api_key: str, image_base64: str, pdf_text: str) -> Optional[Dict[str, Any]]:
    """Process statement using both image and text for better accuracy."""
    income_categories = ", ".join(INCOME_SUBCLASSES)
    expense_categories = ", ".join(EXPENSE_SUBCLASSES)
    
    prompt = f"""
Analyze this bank statement image and extract transaction data. Return a JSON object with this structure:

{{
  "accountNumber": "account number",
  "period": "statement period",
  "openingBalance": number,
  "closingBalance": number,
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description": "description", 
      "debit": number_or_null,
      "credit": number_or_null,
      "amount": number,
      "balance": number,
      "category": "suggested_category",
      "confidence": "high/medium/low"
    }}
  ]
}}

INCOME CATEGORIES: {income_categories}
EXPENSE CATEGORIES: {expense_categories}

Instructions:
- Extract ALL visible transactions
- Use debit for expenses, credit for income
- Suggest categories from the allowed lists
- Return only valid JSON

Additional text context: {pdf_text[:2000]}
"""
    
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/png", "data": image_base64}}
                ]
            }
        ]
    }
    
    body = post_to_gemini(api_key, payload, timeout=60)
    if not body:
        return None
    
    text = extract_text_from_response(body)
    if not text:
        return None
    
    return extract_json_from_text(text)

def validate_and_clean_transactions(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and clean transaction data."""
    if 'transactions' not in data:
        data['transactions'] = []
    
    cleaned_transactions = []
    
    for tx in data['transactions']:
        # Ensure required fields
        if not tx.get('description'):
            continue
            
        # Clean and validate date
        date_str = tx.get('date', '')
        if not re.match(r'\d{4}-\d{2}-\d{2}', date_str):
            # Try to parse and reformat date
            try:
                # Handle various date formats
                for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%d-%b-%Y', '%b %d, %Y']:
                    try:
                        parsed_date = datetime.datetime.strptime(date_str, fmt)
                        tx['date'] = parsed_date.strftime('%Y-%m-%d')
                        break
                    except:
                        continue
                else:
                    tx['date'] = datetime.datetime.now().strftime('%Y-%m-%d')
            except:
                tx['date'] = datetime.datetime.now().strftime('%Y-%m-%d')
        
        # Ensure amount values
        try:
            tx['debit'] = float(tx.get('debit', 0)) if tx.get('debit') else None
            tx['credit'] = float(tx.get('credit', 0)) if tx.get('credit') else None
            tx['amount'] = float(tx.get('amount', tx.get('debit', tx.get('credit', 0))))
            tx['balance'] = float(tx.get('balance', 0)) if tx.get('balance') else 0
        except (ValueError, TypeError):
            # Skip transactions with invalid amounts
            continue
        
        # Validate category
        category = tx.get('category', 'other_expenses')
        if category not in ALL_CATEGORIES:
            if tx['credit'] and tx['credit'] > 0:
                tx['category'] = 'other_income'
            else:
                tx['category'] = 'other_expenses'
        
        # Set confidence
        tx['confidence'] = tx.get('confidence', 'medium')
        
        cleaned_transactions.append(tx)
    
    data['transactions'] = cleaned_transactions
    return data

def process_statement_pdf(api_key: str, pdf_path: str) -> Optional[Dict[str, Any]]:
    """Main function to process statement PDF."""
    # Remove debug prints that interfere with JSON output
    # Only output to stderr for debugging when called from Node.js
    
    # Extract text from PDF
    pdf_text = extract_text_from_pdf(pdf_path)
    if not pdf_text.strip():
        return {"error": "Could not extract text from PDF"}
    
    # Try text-based processing first (faster)
    result = process_statement_with_text(api_key, pdf_text)
    
    # If text processing fails or returns insufficient data, try with image
    if not result or not result.get('transactions') or len(result.get('transactions', [])) < 1:
        image_base64 = encode_pdf_first_page(pdf_path)
        if image_base64:
            result = process_statement_with_image(api_key, image_base64, pdf_text)
    
    if not result:
        return {"error": "Failed to process statement", "raw_text": pdf_text[:1000]}
    
    # Validate and clean the result
    result = validate_and_clean_transactions(result)
    
    # Add processing metadata
    result['processing_info'] = {
        'method': 'gemini_ai',
        'text_length': len(pdf_text),
        'processed_at': datetime.datetime.now().isoformat(),
        'transaction_count': len(result.get('transactions', []))
    }
    
    return result

def main():
    parser = argparse.ArgumentParser(description='Bank Statement OCR + categorization using Gemini')
    parser.add_argument('pdf_path', nargs='?', help='Path to statement PDF')
    parser.add_argument('--save', '-s', help='Path to save JSON output')
    args = parser.parse_args()

    api_key = load_api_key()
    if not api_key:
        # Only output JSON, send errors to stderr
        result = {"error": "No GEMINI_API_KEY found in environment or .env"}
        print(json.dumps(result, indent=2))
        return

    pdf_path = args.pdf_path
    if not pdf_path:
        try:
            pdf_path = input('Enter path to statement PDF: ').strip()
        except EOFError:
            result = {"error": "No PDF path provided"}
            print(json.dumps(result, indent=2))
            return

    if not pdf_path or not os.path.exists(pdf_path):
        result = {"error": "PDF file not found"}
        print(json.dumps(result, indent=2))
        return

    result = process_statement_pdf(api_key, pdf_path)
    if result is None:
        result = {"error": "Failed to process statement PDF"}

    # Always output valid JSON
    out = json.dumps(result, indent=2)
    print(out)
    
    if args.save:
        with open(args.save, 'w') as f:
            f.write(out)
        # Send success message to stderr so it doesn't interfere with JSON output
        sys.stderr.write(f'Saved output to {args.save}\n')

if __name__ == '__main__':
    main()
