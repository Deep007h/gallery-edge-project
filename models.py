import os
import json
import time
import shutil
import threading
import requests

MODELS_DIR = os.path.expanduser("~/.local/share/gallery-edge/models")
os.makedirs(MODELS_DIR, exist_ok=True)

# Global download tracking state
download_states = {}
download_locks = {}
TOKEN_PATH = os.path.expanduser("~/.local/share/gallery-edge/hf_token.txt")

def get_hf_token():
    if os.path.exists(TOKEN_PATH):
        try:
            with open(TOKEN_PATH, "r") as f:
                return f.read().strip()
        except Exception:
            pass
    return ""

def save_hf_token(token):
    try:
        os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
        with open(TOKEN_PATH, "w") as f:
            f.write(token.strip())
    except Exception:
        pass

def load_allowlist():
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_allowlist.json")
    if not os.path.exists(path):
        return {"models": []}
    with open(path, "r") as f:
        return json.load(f)

def get_model_status(model_name, model_file):
    # Check if file exists locally
    model_path = os.path.join(MODELS_DIR, model_name, model_file)
    if os.path.exists(model_path):
        return "DOWNLOADED"
    
    state = download_states.get(model_name)
    if state:
        return state["status"]
    
    return "NOT_DOWNLOADED"

def get_models_list():
    allowlist = load_allowlist()
    models = []
    for m in allowlist.get("models", []):
        name = m.get("name")
        file_name = m.get("modelFile")
        status = get_model_status(name, file_name)
        
        state = download_states.get(name, {
            "status": status,
            "received_bytes": 0,
            "total_bytes": m.get("sizeInBytes", 0),
            "speed": 0,
            "eta": 0,
            "error": ""
        })
        
        models.append({
            "name": name,
            "modelId": m.get("modelId"),
            "modelFile": file_name,
            "description": m.get("description"),
            "sizeInBytes": m.get("sizeInBytes", 0),
            "commitHash": m.get("commitHash"),
            "llmSupportImage": m.get("llmSupportImage", False),
            "llmSupportAudio": m.get("llmSupportAudio", False),
            "capabilities": m.get("capabilities", []),
            "defaultConfig": m.get("defaultConfig", {}),
            "taskTypes": m.get("taskTypes", []),
            "bestForTaskTypes": m.get("bestForTaskTypes", []),
            "status": state["status"],
            "receivedBytes": state["received_bytes"],
            "speed": state["speed"],
            "eta": state["eta"],
            "error": state["error"]
        })
    
    # Add custom imported models
    custom_dir = os.path.join(MODELS_DIR, "custom")
    if os.path.exists(custom_dir):
        for model_name in os.listdir(custom_dir):
            model_subdir = os.path.join(custom_dir, model_name)
            if os.path.isdir(model_subdir):
                config_path = os.path.join(model_subdir, "config.json")
                if os.path.exists(config_path):
                    with open(config_path, "r") as f:
                        meta = json.load(f)
                    
                    file_name = meta.get("modelFile")
                    model_path = os.path.join(model_subdir, file_name)
                    if os.path.exists(model_path):
                        models.append({
                            "name": f"[Custom] {model_name}",
                            "modelId": "local/custom",
                            "modelFile": file_name,
                            "description": meta.get("description", "Imported custom model"),
                            "sizeInBytes": os.path.getsize(model_path),
                            "commitHash": "local",
                            "llmSupportImage": meta.get("llmSupportImage", False),
                            "llmSupportAudio": meta.get("llmSupportAudio", False),
                            "capabilities": meta.get("capabilities", []),
                            "defaultConfig": meta.get("defaultConfig", {
                                "topK": 40,
                                "topP": 0.95,
                                "temperature": 0.8,
                                "maxTokens": 1024,
                                "accelerators": "cpu"
                            }),
                            "taskTypes": meta.get("taskTypes", ["llm_chat"]),
                            "bestForTaskTypes": [],
                            "status": "DOWNLOADED",
                            "receivedBytes": os.path.getsize(model_path),
                            "speed": 0,
                            "eta": 0,
                            "error": ""
                        })
                        
    return models

def download_model_thread(model_name, model_id, commit_hash, file_name, size_in_bytes):
    dest_dir = os.path.join(MODELS_DIR, model_name)
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, file_name)
    temp_path = dest_path + ".tmp"
    
    download_states[model_name] = {
        "status": "DOWNLOADING",
        "received_bytes": 0,
        "total_bytes": size_in_bytes,
        "speed": 0,
        "eta": 0,
        "error": ""
    }
    
    url = f"https://huggingface.co/{model_id}/resolve/{commit_hash}/{file_name}?download=true"
    headers = {}
    token = get_hf_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"
        
    try:
        # First, follow redirect to get final URL and actual file size
        response = requests.get(url, headers=headers, stream=True, allow_redirects=True)
        if response.status_code not in (200, 206):
            raise Exception(f"HTTP error: {response.status_code} - {response.reason}")
            
        final_url = response.url
        total_length = response.headers.get('content-length')
        if total_length is not None:
            size_in_bytes = int(total_length)
            download_states[model_name]["total_bytes"] = size_in_bytes
            
        response.close()
        
        # Pre-allocate file
        with open(temp_path, "wb") as f:
            f.truncate(size_in_bytes)
            
        # Spawn threads
        num_workers = 8
        chunk_size = size_in_bytes // num_workers
        ranges = []
        for i in range(num_workers):
            start = i * chunk_size
            end = (i + 1) * chunk_size - 1 if i < num_workers - 1 else size_in_bytes - 1
            ranges.append((start, end))
            
        # Thread-safe counter and locks
        bytes_lock = threading.Lock()
        failed_event = threading.Event()
        
        start_time = time.time()
        last_time = start_time
        last_bytes = 0
        
        def download_range(start, end):
            if failed_event.is_set():
                return
            
            try:
                # Open separate file descriptor for concurrent writing
                with open(temp_path, "r+b") as f:
                    range_headers = headers.copy()
                    range_headers["Range"] = f"bytes={start}-{end}"
                    
                    r = requests.get(final_url, headers=range_headers, stream=True)
                    if r.status_code not in (200, 206):
                        raise Exception(f"Chunk HTTP error: {r.status_code}")
                        
                    current_pos = start
                    for chunk in r.iter_content(chunk_size=256 * 1024):  # 256KB sub-chunks
                        if failed_event.is_set():
                            r.close()
                            return
                        if download_states.get(model_name, {}).get("status") == "NOT_DOWNLOADED":
                            failed_event.set()
                            r.close()
                            return
                            
                        if chunk:
                            f.seek(current_pos)
                            f.write(chunk)
                            current_pos += len(chunk)
                            
                            with bytes_lock:
                                download_states[model_name]["received_bytes"] += len(chunk)
                                
                                # Update speed & ETA periodically
                                nonlocal last_time, last_bytes
                                current_time = time.time()
                                time_diff = current_time - last_time
                                if time_diff >= 0.5:
                                    bytes_diff = download_states[model_name]["received_bytes"] - last_bytes
                                    speed = bytes_diff / time_diff
                                    download_states[model_name]["speed"] = int(speed)
                                    remaining_bytes = size_in_bytes - download_states[model_name]["received_bytes"]
                                    download_states[model_name]["eta"] = int(remaining_bytes / speed) if speed > 0 else 9999
                                    last_time = current_time
                                    last_bytes = download_states[model_name]["received_bytes"]
                    r.close()
            except Exception as ex:
                failed_event.set()
                raise ex

        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            futures = [executor.submit(download_range, start, end) for start, end in ranges]
            # Wait for all to finish
            for fut in futures:
                fut.result() # raises exception if any thread failed
                
        if failed_event.is_set():
            if download_states.get(model_name, {}).get("status") == "NOT_DOWNLOADED":
                raise Exception("Download cancelled by user.")
            raise Exception("One of the download worker threads failed.")
            
        # Completed
        if os.path.exists(temp_path):
            shutil.move(temp_path, dest_path)
        download_states[model_name]["status"] = "DOWNLOADED"
        download_states[model_name]["speed"] = 0
        download_states[model_name]["eta"] = 0
    except Exception as e:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        if download_states.get(model_name, {}).get("status") != "NOT_DOWNLOADED":
            download_states[model_name]["status"] = "FAILED"
            download_states[model_name]["error"] = str(e)
        download_states[model_name]["speed"] = 0
        download_states[model_name]["eta"] = 0


def start_download(model_name):
    # Find model info in allowlist
    allowlist = load_allowlist()
    model_info = None
    for m in allowlist.get("models", []):
        if m.get("name") == model_name:
            model_info = m
            break
            
    if not model_info:
        return False, "Model not found in allowlist."
        
    model_id = model_info.get("modelId")
    commit_hash = model_info.get("commitHash")
    file_name = model_info.get("modelFile")
    size_in_bytes = model_info.get("sizeInBytes", 0)
    
    # Check if already downloaded
    dest_path = os.path.join(MODELS_DIR, model_name, file_name)
    if os.path.exists(dest_path):
        return True, "Model already downloaded."
        
    # Check if already downloading
    state = download_states.get(model_name)
    if state and state["status"] == "DOWNLOADING":
        return True, "Model is already downloading."
        
    # Start thread
    t = threading.Thread(target=download_model_thread, args=(model_name, model_id, commit_hash, file_name, size_in_bytes))
    t.daemon = True
    t.start()
    return True, "Download started."

def cancel_download(model_name):
    # In python requests, we don't have a direct cancellation hook unless we track the request handle.
    # To simplify, we mark status as NOT_DOWNLOADED, which will trigger the download loop to exit or cleanup on next chunk check.
    # However, since threads terminate when the socket drops or the server closes, we can just clear the status.
    # To keep it robust, let's allow setting status to NOT_DOWNLOADED so UI shows it cancelled.
    if model_name in download_states:
        download_states[model_name]["status"] = "NOT_DOWNLOADED"
        return True
    return False

def delete_model(model_name, model_file):
    # Check if custom model
    if model_name.startswith("[Custom] "):
        raw_name = model_name.replace("[Custom] ", "")
        model_dir = os.path.join(MODELS_DIR, "custom", raw_name)
    else:
        model_dir = os.path.join(MODELS_DIR, model_name)
        
    if os.path.exists(model_dir):
        shutil.rmtree(model_dir)
        if model_name in download_states:
            del download_states[model_name]
        return True
    return False

def import_custom_model(name, src_path, config):
    try:
        if not os.path.exists(src_path):
            return False, "Source file does not exist."
            
        file_name = os.path.basename(src_path)
        dest_dir = os.path.join(MODELS_DIR, "custom", name)
        os.makedirs(dest_dir, exist_ok=True)
        dest_path = os.path.join(dest_dir, file_name)
        
        # Copy file
        shutil.copy2(src_path, dest_path)
        
        # Write config.json
        meta = {
            "modelFile": file_name,
            "description": config.get("description", "Imported custom model"),
            "llmSupportImage": config.get("llmSupportImage", False),
            "llmSupportAudio": config.get("llmSupportAudio", False),
            "capabilities": config.get("capabilities", []),
            "defaultConfig": {
                "topK": int(config.get("topK", 40)),
                "topP": float(config.get("topP", 0.95)),
                "temperature": float(config.get("temperature", 0.8)),
                "maxTokens": int(config.get("maxTokens", 1024)),
                "accelerators": config.get("accelerators", "cpu")
            },
            "taskTypes": config.get("taskTypes", ["llm_chat"])
        }
        
        with open(os.path.join(dest_dir, "config.json"), "w") as f:
            json.dump(meta, f, indent=2)
            
        return True, "Model imported successfully."
    except Exception as e:
        return False, str(e)
