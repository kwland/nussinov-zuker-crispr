"""Analyze CRISPR guide spacers with the Nussinov folding algorithm.

The main project idea: a guide that folds back on itself, especially in the
PAM-proximal seed region, may have less spacer available to bind its DNA target.
This script gives simple, explainable features your group can compare with
published guide-activity measurements.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from nussinov import nussinov_fold


DEFAULT_SEED_LENGTH = 8
FEATURE_COLUMNS = [
    "spacer_rna",
    "length",
    "gc_percent",
    "nussinov_pairs",
    "self_pair_fraction",
    "dot_bracket",
    "seed_region_1_based",
    "seed_paired_bases",
    "seed_accessibility",
    "design_warning",
    "analysis_status",
]


def gc_fraction(sequence: str) -> float:
    seq = sequence.upper().replace("U", "T")
    if not seq:
        return 0.0
    return (seq.count("G") + seq.count("C")) / len(seq)


def paired_positions(pairs: list[tuple[int, int]]) -> set[int]:
    positions: set[int] = set()
    for i, j in pairs:
        positions.add(i)
        positions.add(j)
    return positions


def design_warnings(sequence: str, gc_percent: float, seed_accessibility: float) -> str:
    warnings = []
    dna = sequence.upper().replace("U", "T")
    if len(dna) != 20:
        warnings.append("not_20_nt_spacer")
    if gc_percent < 30:
        warnings.append("low_gc")
    elif gc_percent > 75:
        warnings.append("high_gc")
    if "TTTT" in dna:
        warnings.append("poly_t_u6_termination_risk")
    if seed_accessibility < 0.5:
        warnings.append("seed_mostly_paired")
    return ";".join(warnings) or "none"


def score_guide(
    spacer: str,
    seed_length: int = DEFAULT_SEED_LENGTH,
    min_loop_length: int = 3,
) -> dict[str, str]:
    if seed_length <= 0:
        raise ValueError("seed_length must be a positive integer")
    result = nussinov_fold(spacer, min_loop_length=min_loop_length)
    paired = paired_positions(result.pairs)
    n = len(result.sequence)
    seed_start = max(0, n - seed_length)
    seed_positions = set(range(seed_start, n))
    seed_paired = len(seed_positions & paired)
    seed_unpaired = len(seed_positions) - seed_paired
    seed_accessibility = seed_unpaired / len(seed_positions) if seed_positions else 0.0
    gc_percent = gc_fraction(result.sequence) * 100
    self_pair_fraction = (2 * result.score / n) if n else 0.0

    return {
        "spacer_rna": result.sequence,
        "length": str(n),
        "gc_percent": f"{gc_percent:.1f}",
        "nussinov_pairs": str(result.score),
        "self_pair_fraction": f"{self_pair_fraction:.3f}",
        "dot_bracket": result.structure,
        "seed_region_1_based": f"{seed_start + 1}-{n}",
        "seed_paired_bases": str(seed_paired),
        "seed_accessibility": f"{seed_accessibility:.3f}",
        "design_warning": design_warnings(result.sequence, gc_percent, seed_accessibility),
        "analysis_status": "ok",
    }


def placeholder_features(status: str) -> dict[str, str]:
    return {column: (status if column == "analysis_status" else "") for column in FEATURE_COLUMNS}


def analyze_guides(input_csv: Path, output_csv: Path, seed_length: int) -> None:
    if seed_length <= 0:
        raise ValueError("seed_length must be a positive integer")

    with input_csv.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        input_columns = reader.fieldnames or []
        if "spacer_dna" not in input_columns and "spacer_rna" not in input_columns:
            raise ValueError("Input CSV needs a spacer_dna or spacer_rna column.")

        rows = []
        for row in reader:
            spacer = row.get("spacer_rna") or row.get("spacer_dna") or ""
            if not spacer or "REPLACE_WITH" in spacer.upper():
                features = placeholder_features("needs_sequence")
            else:
                features = score_guide(spacer, seed_length=seed_length)
            rows.append({**row, **features})

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys()) if rows else [*input_columns, *FEATURE_COLUMNS]
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fold CRISPR guide spacers with Nussinov.")
    parser.add_argument("--input", default="data/crispr_guide_examples.csv")
    parser.add_argument("--output", default="analysis_outputs/crispr_guide_nussinov_features.csv")
    parser.add_argument("--seed-length", type=int, default=DEFAULT_SEED_LENGTH)
    args = parser.parse_args()

    analyze_guides(Path(args.input), Path(args.output), args.seed_length)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
