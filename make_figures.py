"""Create the repository's SVG figures with the Python standard library."""

from __future__ import annotations

import argparse
import csv
from html import escape
from pathlib import Path


INK = "#16211d"
MUTED = "#61706a"
PAPER = "#f7f4ec"
GREEN = "#2f7d62"
GOLD = "#d6a84a"
LINE = "#d8ded8"


def _svg_text(x: float, y: float, text: str, **attrs: object) -> str:
    options = " ".join(f'{key.replace("_", "-")}="{escape(str(value))}"' for key, value in attrs.items())
    return f'<text x="{x}" y="{y}" {options}>{escape(text)}</text>'


def write_workflow_figure(path: Path) -> None:
    boxes = [
        (45, "1", "Sequence", "RNA or DNA input"),
        (300, "2", "Dynamic programming", "Maximize allowed pairs"),
        (555, "3", "Traceback", "Recover one optimum"),
        (810, "4", "Interpret", "Structure + guide features"),
    ]
    elements = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="330" viewBox="0 0 1080 330" role="img" aria-labelledby="title desc">',
        '<title id="title">Nussinov analysis workflow</title>',
        '<desc id="desc">Four steps: sequence input, dynamic programming, traceback, and interpretation.</desc>',
        f'<rect width="1080" height="330" fill="{PAPER}" rx="24"/>',
        _svg_text(45, 54, "How a sequence becomes an explainable fold", fill=INK, font_size=28, font_weight=700, font_family="Arial, sans-serif"),
        _svg_text(45, 82, "The Python path is deliberately small: each result can be inspected from input to output.", fill=MUTED, font_size=16, font_family="Arial, sans-serif"),
    ]
    for index, (x, number, title, subtitle) in enumerate(boxes):
        elements.extend(
            [
                f'<rect x="{x}" y="125" width="215" height="140" rx="16" fill="#ffffff" stroke="{LINE}" stroke-width="2"/>',
                f'<circle cx="{x + 28}" cy="156" r="15" fill="{GREEN}"/>',
                _svg_text(x + 28, 162, number, fill="#ffffff", font_size=15, font_weight=700, text_anchor="middle", font_family="Arial, sans-serif"),
                _svg_text(x + 22, 205, title, fill=INK, font_size=18, font_weight=700, font_family="Arial, sans-serif"),
                _svg_text(x + 22, 234, subtitle, fill=MUTED, font_size=14, font_family="Arial, sans-serif"),
            ]
        )
        if index < len(boxes) - 1:
            elements.append(f'<path d="M {x + 220} 195 H {x + 246}" stroke="{GOLD}" stroke-width="4" stroke-linecap="round"/>')
            elements.append(f'<path d="M {x + 240} 189 L {x + 248} 195 L {x + 240} 201" fill="none" stroke="{GOLD}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
    elements.append("</svg>")
    path.write_text("\n".join(elements) + "\n", encoding="utf-8")


def read_features(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("analysis_status") == "ok"]
    if not rows:
        raise ValueError(f"No analyzed rows found in {path}")
    return rows


def write_feature_figure(path: Path, rows: list[dict[str, str]]) -> None:
    width = 1080
    height = 190 + 74 * len(rows)
    plot_left = 300
    plot_width = 680
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">',
        '<title id="title">Guide feature comparison</title>',
        '<desc id="desc">Horizontal bars compare GC fraction and Nussinov seed accessibility for illustrative guide sequences.</desc>',
        f'<rect width="{width}" height="{height}" fill="{PAPER}" rx="24"/>',
        _svg_text(45, 54, "Illustrative guide features", fill=INK, font_size=28, font_weight=700, font_family="Arial, sans-serif"),
        _svg_text(45, 82, "These synthetic examples demonstrate the pipeline; they are not measurements of editing activity.", fill=MUTED, font_size=16, font_family="Arial, sans-serif"),
        f'<rect x="45" y="108" width="14" height="14" rx="3" fill="{GREEN}"/>',
        _svg_text(68, 120, "G/C fraction", fill=INK, font_size=14, font_family="Arial, sans-serif"),
        f'<rect x="180" y="108" width="14" height="14" rx="3" fill="{GOLD}"/>',
        _svg_text(203, 120, "Seed accessibility", fill=INK, font_size=14, font_family="Arial, sans-serif"),
    ]
    for tick in range(0, 101, 25):
        x = plot_left + plot_width * tick / 100
        elements.append(f'<line x1="{x}" y1="148" x2="{x}" y2="{height - 34}" stroke="{LINE}" stroke-width="1"/>')
        elements.append(_svg_text(x, 143, f"{tick}%", fill=MUTED, font_size=12, text_anchor="middle", font_family="Arial, sans-serif"))

    for index, row in enumerate(rows):
        y = 175 + index * 74
        name = row.get("name") or f"guide_{index + 1}"
        gc_value = float(row["gc_percent"]) / 100
        seed_value = float(row["seed_accessibility"])
        elements.append(_svg_text(45, y + 18, name.replace("_", " "), fill=INK, font_size=15, font_weight=700, font_family="Arial, sans-serif"))
        elements.append(f'<rect x="{plot_left}" y="{y}" width="{plot_width * gc_value:.1f}" height="18" rx="5" fill="{GREEN}"/>')
        elements.append(f'<rect x="{plot_left}" y="{y + 25}" width="{plot_width * seed_value:.1f}" height="18" rx="5" fill="{GOLD}"/>')
        elements.append(_svg_text(plot_left + plot_width + 14, y + 15, f"{gc_value:.0%}", fill=GREEN, font_size=13, font_weight=700, font_family="Arial, sans-serif"))
        elements.append(_svg_text(plot_left + plot_width + 14, y + 40, f"{seed_value:.0%}", fill="#9a6e15", font_size=13, font_weight=700, font_family="Arial, sans-serif"))
    elements.append("</svg>")
    path.write_text("\n".join(elements) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate the repository's SVG figures.")
    parser.add_argument("--features", type=Path, default=Path("analysis_outputs/crispr_guide_nussinov_features.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("figures"))
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_workflow_figure(args.output_dir / "nussinov_workflow.svg")
    write_feature_figure(args.output_dir / "guide_feature_summary.svg", read_features(args.features))
    print(f"Wrote SVG figures to {args.output_dir}")


if __name__ == "__main__":
    main()
