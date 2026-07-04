import json

import folder_paths


class A1111LoraSelector:
    """A1111-style lora selector. The card-grid UI lives in the frontend and
    writes the current selection into the hidden `selection` widget as JSON:
    a list of {"name": str, "strength": float, "on": bool}. This node turns
    that into a LORA_STACK compatible with the usual stack consumers."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selection": ("STRING", {"default": "[]"}),
            },
            "optional": {
                "optional_lora_stack": ("LORA_STACK",),
            },
        }

    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("lora_stack",)
    FUNCTION = "build_stack"
    CATEGORY = "loaders"

    def build_stack(self, selection, optional_lora_stack=None):
        loras = []
        if optional_lora_stack is not None:
            loras.extend(l for l in optional_lora_stack if l[0] != "None")

        available = set(folder_paths.get_filename_list("loras"))
        for item in json.loads(selection):
            name = item.get("name")
            if not name or name == "None" or not item.get("on", True):
                continue
            if name not in available:
                continue
            strength = float(item.get("strength", 1.0))
            loras.append((name, strength, strength))

        return (loras,)


NODE_CLASS_MAPPINGS = {
    "A1111LoraSelector": A1111LoraSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "A1111LoraSelector": "A1111 Lora Selector",
}
