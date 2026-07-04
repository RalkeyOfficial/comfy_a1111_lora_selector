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


def _read_info(base):
    """Normalize A1111 (NAME.json) or ComfyUI-downloader (NAME.cminfo.json) metadata."""
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

    a1111 = base + ".json"
    cminfo = base + ".cminfo.json"
    if os.path.exists(a1111):
        with open(a1111, "r", encoding="utf-8") as f:
            data = json.load(f)
        info["format"] = "a1111"
        info["description"] = data.get("description") or ""
        info["activationText"] = data.get("activation text") or ""
        info["baseModel"] = data.get("sd version") or None
        info["negativeText"] = data.get("negative text") or ""
        info["preferredWeight"] = data.get("preferred weight")
        info["notes"] = data.get("notes") or ""
    elif os.path.exists(cminfo):
        with open(cminfo, "r", encoding="utf-8") as f:
            data = json.load(f)
        info["format"] = "comfy-downloader"
        info["description"] = data.get("ModelDescription") or ""
        info["descriptionHtml"] = True
        info["baseModel"] = data.get("BaseModel") or None
        info["trainedWords"] = data.get("TrainedWords") or []
        info["activationText"] = ", ".join(info["trainedWords"])
        info["tags"] = data.get("Tags") or []
        info["modelName"] = data.get("ModelName") or None
        info["creator"] = data.get("CreatorUsername") or None

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
