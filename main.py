import os
import sys
import json
import asyncio
import threading
import logging
import webbrowser
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Import our custom modules
import models
import inference

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(title="Google AI Edge Gallery Replica")

# Active inference session manager
inference_manager = inference.LiteRTInferenceManager()

# Global list of connected websockets
connected_websockets = set()

# Lock for inference manager calls
inference_lock = asyncio.Lock()

# Background task to broadcast download status
active_downloads_check = True

async def broadcast_download_status():
    global active_downloads_check
    while active_downloads_check:
        try:
            # Check if there are any active downloads
            models_list = models.get_models_list()
            is_any_downloading = any(m.get("status") == "DOWNLOADING" for m in models_list)
            
            if is_any_downloading and connected_websockets:
                # Send update to all clients
                payload = json.dumps({
                    "type": "download_update",
                    "models": models_list
                })
                # Gather coroutines
                await asyncio.gather(
                    *[ws.send_text(payload) for ws in connected_websockets],
                    return_exceptions=True
                )
            
            # Broadcast every 1 second
            await asyncio.sleep(1.0)
        except Exception as e:
            logger.error(f"Error in download status broadcast: {e}")
            await asyncio.sleep(2.0)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(broadcast_download_status())

@app.on_event("shutdown")
async def shutdown_event():
    global active_downloads_check
    active_downloads_check = False
    inference_manager.unload_model()

# API Endpoints
class ImportModelRequest(BaseModel):
    name: str
    srcPath: str
    description: str = "Imported custom model"
    llmSupportImage: bool = False
    llmSupportAudio: bool = False
    capabilities: list = []
    topK: int = 40
    topP: float = 0.95
    temperature: float = 0.8
    maxTokens: int = 1024
    accelerators: str = "cpu"

class SetTokenRequest(BaseModel):
    token: str

@app.get("/api/models")
def get_models():
    try:
        return {"models": models.get_models_list()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/models/download")
def download_model(payload: dict):
    model_name = payload.get("name")
    if not model_name:
        raise HTTPException(status_code=400, detail="Model name is required.")
    
    success, msg = models.start_download(model_name)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

@app.post("/api/models/cancel")
def cancel_download(payload: dict):
    model_name = payload.get("name")
    if not model_name:
        raise HTTPException(status_code=400, detail="Model name is required.")
    
    success = models.cancel_download(model_name)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to cancel download.")
    return {"status": "success", "message": "Download canceled."}

@app.post("/api/models/delete")
def delete_model(payload: dict):
    model_name = payload.get("name")
    model_file = payload.get("modelFile")
    if not model_name or not model_file:
        raise HTTPException(status_code=400, detail="Model name and file are required.")
    
    # Check if loaded
    if inference_manager.current_model_path and model_name in inference_manager.current_model_path:
        inference_manager.unload_model()
        
    success = models.delete_model(model_name, model_file)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to delete model.")
    return {"status": "success", "message": "Model deleted."}

@app.post("/api/models/import")
def import_model(payload: ImportModelRequest):
    success, msg = models.import_custom_model(
        name=payload.name,
        src_path=payload.srcPath,
        config=payload.dict()
    )
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"status": "success", "message": msg}

@app.post("/api/models/set-token")
def set_hf_token(payload: SetTokenRequest):
    models.save_hf_token(payload.token)
    return {"status": "success", "message": "HF OAuth token set."}


# WebSocket Chat Server
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.add(websocket)
    logger.info("WebSocket client connected.")
    
    loop = asyncio.get_running_loop()
    
    # Callback to stream tool triggers to the client
    def on_tool_triggered(action_name, params):
        # We run the socket message write asynchronously using the active event loop
        logger.info(f"Broadcasting tool trigger: {action_name} with params {params}")
        payload = json.dumps({
            "type": "tool_call",
            "name": action_name,
            "parameters": params
        })
        asyncio.run_coroutine_threadsafe(websocket.send_text(payload), loop)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")
            
            if msg_type == "init_chat":
                model_name = msg.get("modelName")
                model_file = msg.get("modelFile")
                backend = msg.get("backend", "cpu")
                task_type = msg.get("taskType", "llm_chat")
                config = msg.get("config", {})
                
                # Resolve local model path
                # Custom models are placed under models/custom/<name>/<file>
                if "[Custom] " in model_name:
                    raw_name = model_name.replace("[Custom] ", "")
                    model_path = os.path.join(models.MODELS_DIR, "custom", raw_name, model_file)
                else:
                    model_path = os.path.join(models.MODELS_DIR, model_name, model_file)
                
                if not os.path.exists(model_path):
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "status": "error",
                        "message": f"Model file not found at {model_path}. Please download it first."
                    }))
                    continue
                
                await websocket.send_text(json.dumps({
                    "type": "status",
                    "status": "loading",
                    "message": f"Loading model {model_name} on {backend.upper()}..."
                }))
                
                # Thread-safe loading and initialization
                async with inference_lock:
                    try:
                        # Load engine (releases previous engine if name/backend changed)
                        inference_manager.load_model(model_path, backend_name=backend)
                        
                        # Set up toolset
                        tools_list = None
                        if task_type == "llm_mobile_actions":
                            tools_list = inference.build_mobile_actions_tools(on_tool_triggered)
                        elif task_type == "llm_tiny_garden":
                            tools_list = inference.build_tiny_garden_tools(on_tool_triggered)
                            
                        # Initialize conversation
                        inference_manager.start_chat(tools_list=tools_list, sampler_params=config)
                        
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "status": "ready",
                            "message": f"Model loaded successfully on {backend.upper()}."
                        }))
                    except Exception as e:
                        logger.error(f"Error loading model: {e}")
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "status": "error",
                            "message": f"Failed to load model: {str(e)}"
                        }))
            
            elif msg_type == "send_message":
                text = msg.get("text", "")
                if not text:
                    continue
                
                async with inference_lock:
                    try:
                        # Yield token events
                        for chunk in inference_manager.generate(text):
                            if chunk["type"] == "text":
                                await websocket.send_text(json.dumps({
                                    "type": "token",
                                    "text": chunk["text"]
                                }))
                            elif chunk["type"] == "error":
                                await websocket.send_text(json.dumps({
                                    "type": "error",
                                    "message": chunk["message"]
                                }))
                        
                        # Send done event
                        await websocket.send_text(json.dumps({"type": "done"}))
                    except Exception as e:
                        logger.error(f"Error during generation: {e}")
                        await websocket.send_text(json.dumps({
                            "type": "error",
                            "message": f"Generation failed: {str(e)}"
                        }))
                        
            elif msg_type == "get_download_status":
                await websocket.send_text(json.dumps({
                    "type": "download_update",
                    "models": models.get_models_list()
                }))
                
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket session error: {e}")
    finally:
        connected_websockets.discard(websocket)

# Serve Frontend static assets
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="static")
else:
    @app.get("/")
    def read_root():
        return {
            "status": "backend_ready",
            "message": "Vite frontend is not built yet. Run 'npm run build' inside frontend directory."
        }

# Launcher
def start_uvicorn(port=8000):
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__":
    port = 8000
    
    # Run uvicorn in a separate daemon thread
    server_thread = threading.Thread(target=start_uvicorn, args=(port,))
    server_thread.daemon = True
    server_thread.start()
    
    logger.info(f"Server started on http://127.0.0.1:{port}")
    
    # Launch GUI using pywebview if available, otherwise launch native browser fallback
    gui_launched = False
    try:
        import webview
        logger.info("Launching native pywebview UI window...")
        webview.create_window(
            title="Google AI Edge Gallery - Linux",
            url=f"http://127.0.0.1:{port}",
            width=1280,
            height=800,
            resizable=True
        )
        webview.start()
        gui_launched = True
    except ImportError:
        logger.info("pywebview is not installed. Falling back to default web browser...")
    except Exception as e:
        logger.error(f"Failed to launch native pywebview window: {e}. Falling back to default web browser...")
        
    if not gui_launched:
        webbrowser.open(f"http://127.0.0.1:{port}")
        # Keep python process alive while server is running
        try:
            while True:
                import time
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Shutting down...")
            sys.exit(0)
