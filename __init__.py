import json
import os

import folder_paths
import nodes
import server
from aiohttp import web

from .lora_selector_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def _base_path(name):
    """Absolute path of a lora without its extension, or None if it isn't ours."""
    full = folder_paths.get_full_path("loras", name)
    if full is None:
        return None
    return os.path.splitext(full)[0]


def _preview_files(base):
    """Ordered preview image paths for a lora, across both supported layouts."""
    files = []
    # A1111 primary (NAME.png) or ComfyUI-downloader (NAME.preview.jpeg).
    for ext in IMAGE_EXTS:
        if os.path.exists(base + ext):
            files.append(base + ext)
            break
    for ext in IMAGE_EXTS:
        if os.path.exists(base + ".preview" + ext):
            files.append(base + ".preview" + ext)
            break
    # A1111 extra previews: NAME_0.png, NAME_1.png, ...
    i = 0
    while True:
        found = next((f"{base}_{i}{ext}" for ext in IMAGE_EXTS if os.path.exists(f"{base}_{i}{ext}")), None)
        if found is None:
            break
        files.append(found)
        i += 1
    return files


def _load_json(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _read_info(base):
    """Normalize metadata. Rich display data comes from the ComfyUI-downloader
    (NAME.cminfo.json) or A1111 (NAME.json) file; the user-editable preferred
    weight and notes always come from the A1111 file, which we own for edits."""
    info = {
        "format": None,
        "description": "",
        "descriptionHtml": False,
        "baseModel": None,
        "activationText": "",
        "trainedWords": [],
        "negativeText": "",
        "preferredWeight": None,
        "notes": "",
        "tags": [],
        "modelName": None,
        "creator": None,
    }

    data_a = _load_json(base + ".json")
    data_c = _load_json(base + ".cminfo.json")

    if data_c is not None:
        info["format"] = "comfy-downloader"
        info["description"] = data_c.get("ModelDescription") or ""
        info["descriptionHtml"] = True
        info["baseModel"] = data_c.get("BaseModel") or None
        info["trainedWords"] = data_c.get("TrainedWords") or []
        info["activationText"] = ", ".join(info["trainedWords"])
        info["tags"] = data_c.get("Tags") or []
        info["modelName"] = data_c.get("ModelName") or None
        info["creator"] = data_c.get("CreatorUsername") or None
    elif data_a is not None:
        info["format"] = "a1111"
        info["description"] = data_a.get("description") or ""
        info["activationText"] = data_a.get("activation text") or ""
        info["baseModel"] = data_a.get("sd version") or None
        info["negativeText"] = data_a.get("negative text") or ""

    if data_a is not None:
        info["preferredWeight"] = data_a.get("preferred weight")
        info["notes"] = data_a.get("notes") or ""

    return info


@server.PromptServer.instance.routes.get("/a1111_lora_selector/loras")
async def get_loras(request):
    return web.json_response(folder_paths.get_filename_list("loras"))


@server.PromptServer.instance.routes.get("/a1111_lora_selector/info")
async def get_info(request):
    name = request.query.get("name", "")
    base = _base_path(name)
    if base is None:
        return web.json_response({"error": "not found"}, status=404)
    info = _read_info(base)
    info["name"] = name
    info["previewCount"] = len(_preview_files(base))
    return web.json_response(info)


@server.PromptServer.instance.routes.post("/a1111_lora_selector/info")
async def save_info(request):
    data = await request.json()
    base = _base_path(data.get("name", ""))
    if base is None:
        return web.json_response({"error": "not found"}, status=404)
    # Store editable fields in the A1111 sidecar, keeping any existing keys.
    path = base + ".json"
    existing = _load_json(path) or {}
    if "preferredWeight" in data:
        existing["preferred weight"] = data["preferredWeight"]
    if "notes" in data:
        existing["notes"] = data["notes"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=4, ensure_ascii=False)
    return web.json_response({"ok": True})


@server.PromptServer.instance.routes.get("/a1111_lora_selector/preview")
async def get_preview(request):
    name = request.query.get("name", "")
    base = _base_path(name)
    if base is None:
        return web.Response(status=404)
    try:
        index = int(request.query.get("i", "0"))
    except ValueError:
        index = 0
    files = _preview_files(base)
    if not 0 <= index < len(files):
        return web.Response(status=404)
    return web.FileResponse(files[index])


# Serve the built React frontend as a ComfyUI web extension.
workspace_path = os.path.dirname(__file__)
dist_path = os.path.join(workspace_path, "dist")
if os.path.exists(dist_path):
    project_name = os.path.basename(workspace_path)
    try:
        # Method added in https://github.com/comfyanonymous/ComfyUI/pull/8357
        from comfy_config import config_parser

        project_name = config_parser.extract_node_configuration(workspace_path).project.name
    except Exception:
        pass
    nodes.EXTENSION_WEB_DIRS[project_name] = dist_path
else:
    print("A1111 Lora Selector: dist/ not found, run `npm run build` in ui/")
