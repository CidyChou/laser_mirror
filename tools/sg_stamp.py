#!/usr/bin/env python3
"""Stamp a content hash onto relative asset URLs in a staged H5 site.

The hash is computed before rewriting, so identical site contents always get
the same query string. Only the staging directory is modified.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

TEXT_SUFFIXES = {".html", ".css", ".js", ".json"}
ASSET_EXT = r"png|jpe?g|webp|gif|svg|ico|mp3|wav|ogg|ttf"
AUDIO_EXT = r"mp3|wav|ogg"

# Quoted site assets. The path must start with a known relative root so
# library strings such as ".png" or download filenames stay untouched.
QUOTED_ASSET = re.compile(
    rf"""(?P<q>["'`])(?P<url>(?:\./|\.\./)?(?:public/assets|ui|audio)/[A-Za-z0-9][\w./-]*\.(?:{ASSET_EXT}))(?:\?[^"'`]*)?(?P=q)"""
)

# `${root}/file.mp3` keeps the directory in a variable and the file in the template.
TEMPLATE_SUFFIX = re.compile(
    rf"/(?P<name>[A-Za-z0-9][\w.-]*\.(?:{ASSET_EXT}))(?P<q>`)"
)

BARE_AUDIO = re.compile(
    rf"""(?P<q>["'`])(?P<name>[A-Za-z0-9][\w.-]*\.(?:{AUDIO_EXT}))(?:\?[^"'`]*)?(?P=q)"""
)

HTML_ATTR = re.compile(
    r"""(?P<prefix>\b(?:href|src)\s*=\s*)(?P<q>["'])(?P<url>[^"']+)(?P=q)"""
)

CSS_URL = re.compile(
    r"""(?P<prefix>url\(\s*)(?P<q>["']?)(?P<url>[^"')\s]+)(?P=q)(?P<suffix>\s*\))"""
)

JS_IMPORT = re.compile(
    r"""(?P<prefix>\b(?:from|import)\s*\(?\s*)(?P<q>["'])(?P<url>(?:\./|\.\./)[^"']+?\.js)(?:\?[^"']*)?(?P=q)"""
)

# Atlas image paths are JSON values. Frame keys that look like icon paths must stay
# unchanged, because the renderer looks them up without a query string.
ATLAS_VALUE = re.compile(
    r"""(?P<prefix>:\s*")(?P<url>(?:\./)?public/assets/atlases/[A-Za-z0-9][\w./-]*\.(?:webp|png|jpe?g))(?:\?[^"]*)?\""""
)

SOURCE_MAP = re.compile(r"[ \t]*//# sourceMappingURL=\S+")

ROOT_ATTR = re.compile(r"""(?:href|src)\s*=\s*(["'])(/(?!/)[^"']*)\1""")
ROOT_CSS = re.compile(r"""url\(\s*(["']?)(/(?!/)[^"')\s]*)\1\s*\)""")
ROOT_IMPORT = re.compile(
    r"""\b(?:from|import)\s*\(?\s*(["'])(/(?!/)[^"']+\.js(?:\?[^"']*)?)\1"""
)


def with_version(url: str, version: str) -> str:
    base, hash_sep, fragment = url.partition("#")
    base = base.split("?", 1)[0]
    stamped = f"{base}?v={version}"
    if hash_sep:
        stamped += f"#{fragment}"
    return stamped


def is_remote(url: str) -> bool:
    return url.startswith(("http://", "https://", "//", "data:", "blob:", "mailto:", "javascript:"))


def stamp_text(text: str, version: str, *, bare_media: bool, suffix: str) -> str:
    def quoted(match: re.Match[str]) -> str:
        url = match.group("url")
        if is_remote(url) or url.startswith("/"):
            return match.group(0)
        return f"{match.group('q')}{with_version(url, version)}{match.group('q')}"

    def template_suffix(match: re.Match[str]) -> str:
        return f"/{with_version(match.group('name'), version)}{match.group('q')}"

    def bare(match: re.Match[str]) -> str:
        return f"{match.group('q')}{with_version(match.group('name'), version)}{match.group('q')}"

    def html_attr(match: re.Match[str]) -> str:
        url = match.group("url")
        if not url or is_remote(url) or url.startswith(("#", "/")):
            return match.group(0)
        return f"{match.group('prefix')}{match.group('q')}{with_version(url, version)}{match.group('q')}"

    def css_url(match: re.Match[str]) -> str:
        url = match.group("url")
        if not url or is_remote(url) or url.startswith(("#", "/")):
            return match.group(0)
        quote = match.group("q")
        return f"{match.group('prefix')}{quote}{with_version(url, version)}{quote}{match.group('suffix')}"

    def js_import(match: re.Match[str]) -> str:
        return (
            f"{match.group('prefix')}{match.group('q')}"
            f"{with_version(match.group('url'), version)}{match.group('q')}"
        )

    def atlas(match: re.Match[str]) -> str:
        return f'{match.group("prefix")}{with_version(match.group("url"), version)}"'

    # JSON keeps lookup keys intact. Only atlas image values are URLs.
    if suffix == ".json":
        return ATLAS_VALUE.sub(atlas, text)

    text = SOURCE_MAP.sub("", text)
    text = QUOTED_ASSET.sub(quoted, text)
    text = TEMPLATE_SUFFIX.sub(template_suffix, text)
    if bare_media:
        text = BARE_AUDIO.sub(bare, text)
    text = HTML_ATTR.sub(html_attr, text)
    text = CSS_URL.sub(css_url, text)
    text = JS_IMPORT.sub(js_import, text)
    text = ATLAS_VALUE.sub(atlas, text)
    return text


def iter_text_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in path.relative_to(root).parts):
            continue
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if path.name.endswith(".map"):
            continue
        yield path


def content_version(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(iter_text_files(root), key=lambda item: item.relative_to(root).as_posix()):
        digest.update(path.relative_to(root).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:16]


def root_absolute_urls(text: str) -> list[str]:
    found: list[str] = []
    for pattern in (ROOT_ATTR, ROOT_CSS, ROOT_IMPORT):
        for match in pattern.finditer(text):
            found.append(match.group(2))
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("site")
    parser.add_argument(
        "--bare-media",
        action="store_true",
        help="also version bare audio filenames that are joined with a relative directory",
    )
    args = parser.parse_args()
    root = Path(args.site)
    if not root.is_dir():
        print(f"site directory not found: {root}", file=sys.stderr)
        return 1
    version = content_version(root)
    problems: list[str] = []
    changed = 0
    for path in list(iter_text_files(root)):
        original = path.read_text(encoding="utf-8")
        updated = stamp_text(
            original,
            version,
            bare_media=args.bare_media,
            suffix=path.suffix.lower(),
        )
        if path.suffix.lower() == ".json":
            try:
                json.loads(updated)
            except json.JSONDecodeError as error:
                print(f"invalid JSON after stamp: {path}: {error}", file=sys.stderr)
                return 1
        hits = root_absolute_urls(updated)
        if hits:
            problems.append(f"{path.relative_to(root)}: {', '.join(hits[:8])}")
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    if problems:
        print("root-absolute asset URLs cannot run under /<name>/:", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    print(version)
    print(f"stamped {changed} files", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
