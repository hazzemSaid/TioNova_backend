from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import pdfplumber
import io
import time
import requests
import json
import re
from pdf2image import convert_from_bytes
import pytesseract
import fitz  # PyMuPDF
from PIL import Image, ImageEnhance, ImageFilter
from dotenv import load_dotenv
import os
import asyncio
import json_repair


app = FastAPI()

# ===== CORS Middleware =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables from .env file
load_dotenv()

# OpenRouter API configuration
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = "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"
if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY environment variable is not set")
    
# Model configuration
MODEL_NAME = "deepseek/deepseek-chat-v3.1:free" # OpenRouter model name for DeepSeek Chat

# Configure Tesseract path from environment variable or use default
TESSERACT_CMD = os.getenv('TESSERACT_CMD', r"C:\Program Files\Tesseract-OCR\tesseract.exe")
pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
def summarize_text(text: str) -> str:
    prompt = f"""
Summarize the following text in a professional, structured JSON format suitable for displaying in an educational app. 
Return ONLY valid JSON with these sections:

1. "key_concepts": a list of main concepts, each with:
   - "title": the concept title
   - "text": a clear, professional explanation
   - "tags": optional keywords
   - "difficulty_level": optional ("easy", "medium", "hard")

2. "examples": a list of practical examples for each concept, each with:
   - "concept": the concept it illustrates
   - "example": step-by-step calculation or explanation
   - "notes": optional short note

3. "professional_implications": list of professional applications, each with:
   - "title": area of application
   - "text": explanation of importance in practice

Ensure:
- Clear, concise sentences
- Include numerical/formula examples where relevant
- JSON is valid and parseable for direct use in an app

Text to summarize:
{text}
    """
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": "You are a helpful AI assistant that provides detailed, structured responses."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2000,
        "stream": False
    }
    
    try:
        # Set explicit timeouts: (connect_timeout, read_timeout)
        response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=(15, 120))
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[Summarization error: {e}]"

# ===== PDF Summarization Endpoint =====
@app.post("/summerypdf")
async def summerypdf(file: UploadFile = File(...)):
    pdf_bytes = await file.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    all_text = []

    for page_num, page in enumerate(doc, start=1):
        text = page.get_text().strip()
        if text:
            all_text.append(text)
        else:
            mat = fitz.Matrix(2, 2)  # Reduced resolution for faster processing
            pix = page.get_pixmap(matrix=mat)
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img = preprocess_image(img)
            ocr_text = pytesseract.image_to_string(img, lang="eng+ara", config="--psm 6").strip()
            all_text.append(ocr_text)

    doc.close()
    combined_text = "\n".join(all_text)
    summary = summarize_text(combined_text)

    return {
        "total_pages": len(all_text),
        "extracted_text": combined_text[:1000] + "..." if len(combined_text) > 1000 else combined_text,
        "summary": summary,
    }

# ===== Image Preprocessing for OCR =====
def preprocess_image(img):
    img = img.convert("L")  # Convert to grayscale
    img = ImageEnhance.Contrast(img).enhance(2.0)  # Increase contrast
    img = img.filter(ImageFilter.MedianFilter())  # Reduce noise
    return img

# ===== PDF Text Extraction =====
async def extract_text_from_pdf_async(file_bytes, max_pages=5):
    text = ""
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            page_text = page.get_text().strip()
            if page_text:
                text += page_text + "\n"
            else:
                mat = fitz.Matrix(2, 2)
                pix = page.get_pixmap(matrix=mat)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img = preprocess_image(img)
                ocr_text = await asyncio.to_thread(pytesseract.image_to_string, img, lang="eng+ara", config="--psm 6")
                text += ocr_text.strip() + "\n"
        doc.close()
    except Exception as e:
        print(f"PDF extraction error: {e}")
    return text

# ===== Text Chunking =====
def split_into_chunks(text, chunk_size=1000):
    paragraphs = text.split("\n\n")
    chunks = []
    current_chunk = ""
    for para in paragraphs:
        if len(current_chunk) + len(para) < chunk_size:
            current_chunk += para + "\n\n"
        else:
            chunks.append(current_chunk.strip())
            current_chunk = para + "\n\n"
    if current_chunk:
        chunks.append(current_chunk.strip())
    return [chunk for chunk in chunks if len(chunk) > 50 and not chunk.isdigit()]

# ===== MCQ Generator Class =====
class MCQGenerator:
    def __init__(self, api_key=OPENROUTER_API_KEY):
        self.api_key = api_key

    def call_gemini_api(self, prompt, max_retries=5):
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        
        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": "You are a helpful AI assistant that creates high-quality multiple-choice questions."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 2000,
            "stream": False
        }
        
        for attempt in range(max_retries):
            try:
                # Set explicit timeouts: (connect_timeout, read_timeout)
                response = requests.post(OPENROUTER_API_URL, headers=headers, json=payload, timeout=(15, 120))
                data = response.json()
                
                if response.status_code == 429:
                    retry_delay = 5
                    print(f"Rate limited, waiting {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    continue
                
                if response.status_code == 200 and "choices" in data:
                    return data["choices"][0]["message"]["content"]
                else:
                    print(f"API Error: {response.status_code}, {data}")
                    
            except Exception as e:
                print(f"Request failed: {e}")
                time.sleep(2)
                
        return None

    def create_mcqs_from_text(self, text, num_questions=10):
        prompt = f"""
Generate {num_questions} multiple choice questions from this text. 
Return the result as a valid JSON array where each question follows this exact format:

[
  {{
    "question": "What is...",
    "options": ["a) Option 1", "b) Option 2", "c) Option 3", "d) Option 4"],
    "answer": "a",
    "explanation": "This is correct because..."
  }}
]

Text to generate questions from:
{text[:2000]}

Make sure:
1. Questions are clear and specific
2. All 4 options are plausible
3. Only one correct answer
4. Answer is just the letter (a, b, c, or d)
5. Explanation is 1-2 sentences
6. Return valid JSON only
"""
        response = self.call_gemini_api(prompt)
        if not response:
            return []
        
        try:
            response = response.strip().lstrip("```").rstrip("```")
            repaired_json = json_repair.repair_json(response)
            mcqs = json.loads(repaired_json)
            
            if not isinstance(mcqs, list):
                print("Response is not a JSON array")
                return []
            return mcqs
        except Exception as e:
            print(f"JSON decode error: {e}, attempting regex fallback")
            mcqs = []
            pattern = r'\{\s*"question":\s*"([^"]+)",\s*"options":\s*\[([^\]]*)\],\s*"answer":\s*"([a-d])",\s*"explanation":\s*"([^"]+)"\s*\}'
            matches = re.findall(pattern, response, re.DOTALL)
            for match in matches:
                question, options_str, answer, explanation = match
                options = [opt.strip() for opt in options_str.split(",")]
                if len(options) == 4:
                    mcqs.append({
                        "question": question,
                        "options": options,
                        "answer": answer,
                        "explanation": explanation
                    })
            return mcqs

# ===== MCQ Generation Endpoint =====
@app.post("/generate_mcq")
async def generate_mcq(file: UploadFile = File(...)):
    start_time = time.time()
    try:
        content_bytes = await file.read()
        if not file.filename.lower().endswith('.pdf'):
            return JSONResponse({"success": False, "error": "Only PDF files are supported"}, status_code=400)
        if len(content_bytes) > 10 * 1024 * 1024:
            return JSONResponse({"success": False, "error": "File too large. Max 10MB."}, status_code=400)

        text = await extract_text_from_pdf_async(content_bytes)
        if not text or len(text.strip()) < 50:
            text = await extract_text_from_pdf_async(content_bytes, max_pages=5)
            if not text or len(text.strip()) < 50:
                return JSONResponse({
                    "success": False,
                    "error": "Unable to extract sufficient text. Ensure the PDF is not empty or contains scannable text."
                }, status_code=400)

        generator = MCQGenerator()
        chunks = split_into_chunks(text, 800)
        selected_text = chunks[0] if chunks else text
        if len(selected_text) > 2000:
            selected_text = selected_text[:2000]

        mcqs = generator.create_mcqs_from_text(selected_text, num_questions=10)
        if not mcqs:
            return JSONResponse({
                "success": False,
                "error": "Failed to generate questions. The extracted text may be too noisy or insufficient."
            }, status_code=500)

        valid_mcqs = []
        for mcq in mcqs:
            if all(k in mcq for k in ["question", "options", "answer"]):
                answer = str(mcq["answer"]).lower().strip()
                if answer in ['a', 'b', 'c', 'd']:
                    mcq["answer"] = answer
                    valid_mcqs.append(mcq)

        if not valid_mcqs:
            return JSONResponse({
                "success": False,
                "error": "No valid questions generated. Try a different PDF or improve scan quality."
            }, status_code=500)

        return JSONResponse({
            "success": True,
            "mcqs": valid_mcqs,
            "total_questions": len(valid_mcqs),
            "processing_time": round(time.time() - start_time, 2),
            "text_length": len(text),
            "text_preview": text[:500] + "..." if len(text) > 500 else text
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({
            "success": False,
            "error": f"Server error: {str(e)}",
            "details": "Please try again or contact support."
        }, status_code=500)

# ===== Health Check and Root Endpoints =====
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "MCQ Generator", "timestamp": int(time.time())}

@app.get("/")
async def root():
    return {"message": "MCQ Generator API is running", "endpoints": ["/generate_mcq", "/summerypdf", "/health"]}

# ===== Main Execution =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)