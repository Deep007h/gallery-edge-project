# Google AI Edge Gallery

A desktop application for running Google AI Edge (LiteRT) models locally with a modern web UI. Browse, download, and chat with LLMs — all on-device, no cloud dependency.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Platform](https://img.shields.io/badge/Linux-AMD64-FF6600?logo=linux&logoColor=white)

---

## Features

- **Model Gallery** — Browse, download, and manage LiteRT models from Hugging Face
- **On-Device Chat** — Run LLMs locally with CPU or GPU acceleration
- **Tool Calling** — Built-in support for mobile actions & tiny garden toolsets
- **WebSocket Streaming** — Real-time token-by-token generation
- **Import Custom Models** — Bring your own `.tflite` models
- **Native Desktop Window** — pywebview native GUI with browser fallback
- **Debian Package** — One-click install via `.deb`

## Quick Start

### Option 1: Install via .deb (Debian/Ubuntu)

```bash
sudo dpkg -i gallery-edge_1.0.0_amd64.deb
gallery-edge
```

### Option 2: Run from source

```bash
# Backend
pip install -r requirements.txt
python main.py

# Frontend (optional, for development)
cd frontend
npm install
npm run dev
```

The app opens at `http://127.0.0.1:8000`.

## Project Structure

```
gallery-edge-project/
├── main.py                 # FastAPI server + WebSocket handler
├── models.py               # Model management (download, import, delete)
├── inference.py            # LiteRT inference engine & tool calling
├── test_engine.py          # Inference engine tests
├── model_allowlist.json    # Curated model registry
├── make_deb.sh             # .deb package builder script
├── gallery-edge_1.0.0_amd64.deb  # Pre-built Debian package
├── frontend/               # Vite + React UI
│   ├── src/                # React components & styles
│   ├── dist/               # Built production assets
│   └── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/models` | List all available models |
| POST | `/api/models/download` | Start model download |
| POST | `/api/models/cancel` | Cancel active download |
| POST | `/api/models/delete` | Delete a downloaded model |
| POST | `/api/models/import` | Import a custom model |
| POST | `/api/models/set-token` | Set Hugging Face OAuth token |
| WS | `/ws` | WebSocket chat session |

## Tech Stack

- **Backend:** Python, FastAPI, LiteRT (AI Edge), Uvicorn
- **Frontend:** React 19, Vite, Lucide React Icons
- **Desktop:** pywebview (native window)
- **Packaging:** dpkg-deb (.deb)

## License

MIT
