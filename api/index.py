from __future__ import annotations

import io
import json
import os
from datetime import datetime, timezone
from string import Template

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import AsyncGroq

def _normalize_origin(value: str) -> str:
    return value.strip().rstrip("/")

def _default_allowed_origins() -> list[str]:
    origins = {
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:4173",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://127.0.0.1:80",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:4173",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
    }

    vercel_url = os.getenv("VERCEL_URL")
    if vercel_url:
        origins.add(f"https://{_normalize_origin(vercel_url)}")

    frontend_origin = os.getenv("FRONTEND_ORIGIN")
    if frontend_origin:
        origins.add(_normalize_origin(frontend_origin))

    return sorted(origin for origin in origins if origin)

def _allowed_origins_from_env() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "")
    if raw_origins.strip():
        parsed = [_normalize_origin(origin) for origin in raw_origins.split(",") if origin.strip()]
        if parsed:
            return parsed

    return _default_allowed_origins()


def get_groq_client(api_key: str) -> AsyncGroq:
    cleaned_key = (api_key or "").strip()
    if not cleaned_key:
        raise HTTPException(status_code=400, detail="Groq API key is required")
    return AsyncGroq(api_key=cleaned_key)


def clamp_context_limit(value: int, default: int = 5000, maximum: int = 20000) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default

    return max(1, min(parsed, maximum))


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins_from_env(),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


@app.post("/api/transcribe")
async def transcribe_audio(api_key: str = Form(...), file: UploadFile = File(...)):
    client = get_groq_client(api_key)

    try:
        audio_bytes = await file.read()
        buffer = io.BytesIO(audio_bytes)
        buffer.name = "audio.webm"

        transcription = await client.audio.transcriptions.create(
            file=buffer,
            model="whisper-large-v3",
            response_format="text",
        )
        return {"text": transcription}
    except Exception as error:
        print(f"Error during transcription: {error}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(error)}") from error


@app.post("/api/suggest")
async def get_suggestions(
    api_key: str = Form(...),
    transcript: str = Form(...),
    system_prompt: str = Form(...),
    context_limit: int = Form(...),
):
    client = get_groq_client(api_key)
    limit = clamp_context_limit(context_limit)
    recent_transcript = transcript[-limit:] if len(transcript) > limit else transcript
    prompt = Template(system_prompt).safe_substitute(transcript=recent_transcript)

    try:
        chat_completion = await client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "system", "content": prompt}],
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        content = chat_completion.choices[0].message.content

        try:
            data = json.loads(content)
            full_list = data.get("suggestions", [])
            return {"suggestions": full_list[:3]}
        except (json.JSONDecodeError, TypeError) as error:
            print(f"Parsing error: {error}")
            fallback = [
                {"type": "talking-point", "text": "Discuss recent progress in this area"},
                {"type": "question", "text": "What are the next milestones?"},
                {"type": "fact", "text": "Verify the project timeline"},
            ]
            return {"suggestions": fallback}
    except Exception as error:
        print(f"Error generating suggestions: {error}")
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/api/chat")
async def detailed_answer(
    api_key: str = Form(...),
    transcript: str = Form(...),
    user_query: str = Form(...),
    chat_history: str = Form(...),
    active_suggestion: str = Form(...),
    system_prompt: str = Form(...),
    context_limit: int = Form(...),
):
    client = get_groq_client(api_key)
    limit = clamp_context_limit(context_limit)
    recent_transcript = transcript[-limit:] if len(transcript) > limit else transcript

    prompt_template = system_prompt
    if active_suggestion == "none":
        prompt_template = prompt_template.replace("ACTIVE SUGGESTION: $active_suggestion", "")

    prompt = Template(prompt_template).safe_substitute(
        transcript=recent_transcript,
        chat_history=chat_history,
        user_query=user_query,
        active_suggestion="" if active_suggestion == "none" else active_suggestion,
    )

    try:
        return StreamingResponse(generate_chunks(client, prompt), media_type="text/plain; charset=utf-8")
    except Exception as error:
        print(f"Error generating detailed answer: {error}")
        raise HTTPException(status_code=500, detail=str(error)) from error


async def generate_chunks(client, prompt):
    try:
        chat_completion = await client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            temperature=0.5,
        )

        async for chunk in chat_completion:
            content = chunk.choices[0].delta.content
            if content:
                yield content
    except Exception as error:
        yield f"Error: {str(error)}"


@app.post("/api/export")
async def export_transcript(
    format: str = Form(...),
    transcript_data: str = Form(...),
    suggestions_data: str = Form(...),
    chat_data: str = Form(...),
):
    try:
        transcript_entries = json.loads(transcript_data)
        suggestion_batches = json.loads(suggestions_data)
        chat_history = json.loads(chat_data)

        if format.lower() == "json":
            return format_as_json(transcript_entries, suggestion_batches, chat_history)
        return format_as_txt(transcript_entries, suggestion_batches, chat_history)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=400, detail=f"Invalid JSON in request: {str(error)}") from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(error)}") from error


def format_as_json(transcript_entries, suggestion_batches, chat_history):
    data = {
        "metadata": {
            "title": "MindFull Transcript",
            "generated": datetime.now(timezone.utc).isoformat(),
        },
        "transcript": transcript_entries,
        "suggestions": suggestion_batches,
        "chat": chat_history,
    }
    return {"data": json.dumps(data, indent=2), "format": "json"}


def format_as_txt(transcript_entries, suggestion_batches, chat_history):
    lines = ["MindFull Transcript", "=" * 50, ""]

    lines.append("TRANSCRIPT:")
    lines.append("-" * 50)
    for entry in transcript_entries:
        timestamp = entry.get("timestamp", "")
        text = entry.get("text", "")
        lines.append(f"[{timestamp}] {text}")

    lines.append("\n\nSUGGESTION BATCHES:")
    lines.append("-" * 50)
    for idx, batch in enumerate(suggestion_batches):
        lines.append(f"\nBatch {idx + 1} [{batch.get('timestamp', '')}]:")
        for suggestion in batch.get("suggestions", []):
            suggestion_type = suggestion.get("type", "unknown")
            text = suggestion.get("text", "")
            lines.append(f"  - ({suggestion_type}) {text}")

    lines.append("\n\nCHAT HISTORY:")
    lines.append("-" * 50)
    for chat_entry in chat_history:
        timestamp = chat_entry.get("timestamp", "")
        role = chat_entry.get("role", "unknown")
        content = chat_entry.get("content", "")
        lines.append(f"[{timestamp}] ({role}): {content}")

    return {"data": "\n".join(lines), "format": "txt"}
