# YouTube Chatbot

A full-stack YouTube video question-answering app. Paste a YouTube video URL and a question; the backend retrieves the video's transcript, finds relevant passages, and uses Google Gemini to generate an answer grounded in those passages.

## Architecture

This repository is an npm-workspaces monorepo:

```text
youtube-chatBot/
├── backend/                  # NestJS API and LangChain pipeline
│   ├── src/
│   │   ├── health/            # Health endpoint
│   │   ├── questions/
│   │   │   ├── dto/           # Request validation
│   │   │   ├── questions.controller.ts
│   │   │   ├── questions.module.ts
│   │   │   └── questions.service.ts
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── nest-cli.json
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React + TypeScript + Vite UI
│   ├── src/
│   │   ├── App.tsx            # Question form and answer display
│   │   ├── main.tsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts         # Proxies /api to the backend
├── package.json              # Workspace and root scripts
└── package-lock.json
```

### Frontend

The React app collects a YouTube URL and a question, submits them as JSON, shows a loading indicator while waiting, and renders the answer as Markdown. Retrieved transcript passages can be expanded below the answer.

### Backend

The NestJS API uses modules, controllers, a DTO, and a service:

- `QuestionsController` handles `POST /api/questions`.
- `CreateQuestionDto` validates `videoUrl` and `question`.
- `QuestionsService` extracts the YouTube video ID, fetches the transcript, runs the LangChain retrieval and answer pipeline, and returns the answer and source passages.
- `HealthController` handles `GET /api/health`.

The API uses a global `/api` prefix, JSON request-body limit of 5 MB, and Nest's validation pipe. Unknown properties in question requests are rejected.

## Question-answering flow

```text
React form
  │ POST /api/questions
  ▼
Vite development proxy
  │ forwards /api to NestJS
  ▼
QuestionsController → CreateQuestionDto validation
  ▼
QuestionsService
  ├─ Extract video ID from YouTube URL
  ├─ Fetch English transcript (en, en-US, or en-GB)
  ├─ Split transcript with RecursiveCharacterTextSplitter
  ├─ Embed transcript chunks with GoogleGenerativeAIEmbeddings
  ├─ Store vectors in an in-memory MemoryVectorStore
  ├─ In parallel: retrieve relevant chunks and pass through the question
  └─ Prompt template → Gemini chat model → StringOutputParser
  ▼
JSON answer + relevant source passages
  ▼
React Markdown answer and expandable sources
```

The parallel step runs the retriever and question passthrough together. Transcript fetching, splitting, and embedding happen before that step because they are required to build the vector store.

The vector store is **in-memory and created anew for each request**. Transcripts and embeddings are not persisted, so a repeated question for the same video fetches and embeds the transcript again.

## API

### `GET /api/health`

Returns a health status and timestamp:

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

### `POST /api/questions`

Request:

```json
{
  "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "question": "What is this video about?"
}
```

Successful response:

```json
{
  "status": "answered",
  "videoId": "dQw4w9WgXcQ",
  "question": "What is this video about?",
  "answer": "The video is about ...",
  "sources": [
    "A relevant transcript passage..."
  ]
}
```

Supported link formats include standard YouTube watch links, `youtu.be` links, and YouTube embed, Shorts, and live links. The backend validates the host and video ID. Transcript retrieval currently requests English captions.

## Requirements

- Node.js 20 or newer recommended
- npm
- A Google Gemini API key with access to the configured chat and embedding models

## Configuration

Set backend configuration in `backend/.env`:

```dotenv
GOOGLE_API_KEY=your-google-api-key
GOOGLE_CHAT_MODEL=gemini-2.5-flash
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
PORT=3000
```

`GOOGLE_API_KEY` is required to answer questions. Model names and port default to the values shown above when omitted. Keep `.env` files private; they are ignored by Git. Never commit a real API key. The repository intentionally does not track a local `.env` file.

## Install and run

From the repository root:

```bash
npm install
npm run dev
```

This starts both applications:

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000>
- Health check: <http://localhost:3000/api/health>

Vite forwards frontend `/api` requests to the backend at `http://localhost:3000`. When running services separately, start the backend and frontend in two terminals:

```bash
npm run start:dev --workspace=@youtube-chatbot/backend
npm run dev --workspace=@youtube-chatbot/frontend
```

## Build

Build both workspaces:

```bash
npm run build
```

The NestJS output is written to `backend/dist/`; the Vite output is written to `frontend/dist/`. To run the compiled backend:

```bash
npm run start:backend
```

Build the frontend before serving its production output with Vite Preview:

```bash
npm run start:frontend
```

## Main technologies

- **Frontend:** React, TypeScript, Vite, `react-markdown`, and `remark-gfm`
- **Backend:** NestJS, TypeScript, Express platform adapter, class-validator
- **LLM orchestration:** LangChain.js prompt templates, runnable parallel composition, and string output parser
- **Models:** Google Gemini chat and embeddings via `@langchain/google-genai`
- **Transcript:** `youtube-transcript`
- **Vector store:** LangChain `MemoryVectorStore` (ephemeral/in-memory)
