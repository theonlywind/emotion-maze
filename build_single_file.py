#!/usr/bin/env python3
"""打包成一個獨立 HTML 檔案（sprite 轉 base64 內嵌），方便攤位直接 double-click 開。

用法：python3 build_single_file.py
輸出：食走壓力，食出好心情.html（同一個資料夾）
"""

import base64
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / "食走壓力，食出好心情.html"


def sprite_data_uris() -> dict[str, str]:
    uris = {}
    for png in sorted((ROOT / "assets" / "sprites").rglob("*.png")):
        rel = png.relative_to(ROOT).as_posix()
        uris[rel] = "data:image/png;base64," + base64.b64encode(png.read_bytes()).decode()
    return uris


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "style.css").read_text(encoding="utf-8")

    scripts = []
    for name in ["data.js", "engine.js", "render.js", "ui.js", "main.js"]:
        scripts.append(f"// ===== {name} =====\n" + (ROOT / "js" / name).read_text(encoding="utf-8"))

    uris = sprite_data_uris()
    # engine.js 用相對路徑砌 img.src，內嵌版改為查表拎 data URI
    lookup = "const SPRITE_DATA = " + repr(uris).replace("'", '"') + ";\n"
    scripts.insert(0, lookup)
    scripts_joined = "\n".join(scripts).replace(
        "img.src = src;",
        "img.src = SPRITE_DATA[src] || src;",
    )

    html = html.replace('<link rel="stylesheet" href="css/style.css">', f"<style>\n{css}\n</style>")
    html = re.sub(r'\s*<script src="js/[^"]+"></script>', "", html)
    html = html.replace("</body>", f"<script>\n{scripts_joined}\n</script>\n</body>")

    OUT.write_text(html, encoding="utf-8")
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"已輸出 {OUT}（{size_mb:.2f} MB，內嵌 {len(uris)} 張 sprite）")


if __name__ == "__main__":
    main()
