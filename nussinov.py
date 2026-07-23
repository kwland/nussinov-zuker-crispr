"""Nussinov RNA secondary-structure prediction.

This module implements the classic dynamic-programming version of the
Nussinov algorithm. It maximizes the number of allowed RNA base pairs, rather
than minimizing thermodynamic free energy.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from os import PathLike
from typing import Iterable


CANONICAL_PAIRS = {("A", "U"), ("U", "A"), ("G", "C"), ("C", "G")}
WOBBLE_PAIRS = {("G", "U"), ("U", "G")}


@dataclass(frozen=True)
class FoldResult:
    sequence: str
    score: int
    structure: str
    pairs: list[tuple[int, int]]
    dp: list[list[int]]


def normalize_rna(sequence: str) -> str:
    """Return an uppercase RNA sequence, accepting DNA input by converting T to U."""
    seq = "".join(sequence.split()).upper().replace("T", "U")
    invalid = sorted(set(seq) - {"A", "C", "G", "U"})
    if invalid:
        raise ValueError(f"Sequence contains non-RNA bases: {', '.join(invalid)}")
    return seq


def can_pair(left: str, right: str, allow_wobble: bool = True) -> bool:
    pairs = CANONICAL_PAIRS | (WOBBLE_PAIRS if allow_wobble else set())
    return (left, right) in pairs


def dot_bracket(length: int, pairs: Iterable[tuple[int, int]]) -> str:
    chars = ["."] * length
    for i, j in pairs:
        chars[i] = "("
        chars[j] = ")"
    return "".join(chars)


def nussinov_fold(
    sequence: str,
    min_loop_length: int = 3,
    allow_wobble: bool = True,
) -> FoldResult:
    """Fold one RNA sequence with the Nussinov recurrence.

    The recurrence maximizes base-pair count over all non-crossing structures:

        N[i,j] = max(
            N[i+1,j],
            N[i,j-1],
            N[i+1,j-1] + pair(i,j),
            max_k N[i,k] + N[k+1,j]
        )

    Bases closer than ``min_loop_length`` unpaired positions cannot pair.
    """
    seq = normalize_rna(sequence)
    n = len(seq)
    if n == 0:
        return FoldResult(seq, 0, "", [], [])
    if min_loop_length < 0:
        raise ValueError("min_loop_length must be non-negative")

    dp = [[0] * n for _ in range(n)]

    for span in range(1, n):
        for i in range(0, n - span):
            j = i + span
            best = max(dp[i + 1][j], dp[i][j - 1])

            if j - i > min_loop_length and can_pair(seq[i], seq[j], allow_wobble):
                best = max(best, dp[i + 1][j - 1] + 1)

            for k in range(i, j):
                best = max(best, dp[i][k] + dp[k + 1][j])

            dp[i][j] = best

    pairs: list[tuple[int, int]] = []

    def traceback(i: int, j: int) -> None:
        if i >= j:
            return

        if (
            j - i > min_loop_length
            and can_pair(seq[i], seq[j], allow_wobble)
            and dp[i][j] == dp[i + 1][j - 1] + 1
        ):
            pairs.append((i, j))
            traceback(i + 1, j - 1)
            return

        if dp[i][j] == dp[i + 1][j]:
            traceback(i + 1, j)
            return

        if dp[i][j] == dp[i][j - 1]:
            traceback(i, j - 1)
            return

        for k in range(i, j):
            if dp[i][j] == dp[i][k] + dp[k + 1][j]:
                traceback(i, k)
                traceback(k + 1, j)
                return

    traceback(0, n - 1)
    pairs.sort()
    return FoldResult(seq, dp[0][n - 1], dot_bracket(n, pairs), pairs, dp)


def format_pairs(pairs: Iterable[tuple[int, int]]) -> str:
    """Format zero-based pairs as one-based positions for human-readable output."""
    return ", ".join(f"{i + 1}-{j + 1}" for i, j in pairs) or "none"


def read_fasta(path: str | PathLike[str]) -> list[tuple[str, str]]:
    """Read named sequences from a FASTA file.

    A FASTA header must appear before sequence data. Empty files and empty
    records are rejected so command-line mistakes fail loudly instead of
    producing a misleading empty result.
    """
    records: list[tuple[str, str]] = []
    name: str | None = None
    chunks: list[str] = []
    with open(path, encoding="utf-8") as handle:
        for line_number, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            if line.startswith(">"):
                if name is not None:
                    if not chunks:
                        raise ValueError(f"FASTA record '{name}' has no sequence")
                    records.append((name, "".join(chunks)))
                name = line[1:].strip() or f"sequence_{len(records) + 1}"
                chunks = []
            else:
                if name is None:
                    raise ValueError(
                        f"FASTA sequence data appears before a header on line {line_number}"
                    )
                chunks.append(line)
        if name is not None:
            if not chunks:
                raise ValueError(f"FASTA record '{name}' has no sequence")
            records.append((name, "".join(chunks)))
    if not records:
        raise ValueError("FASTA file contains no records")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Fold RNA with the Nussinov algorithm.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--sequence", help="RNA or DNA sequence to fold")
    source.add_argument("--fasta", help="FASTA file with one or more sequences")
    parser.add_argument("--min-loop-length", type=int, default=3)
    parser.add_argument("--no-wobble", action="store_true", help="Disable G-U wobble pairs")
    args = parser.parse_args()

    records = [("input", args.sequence)] if args.sequence else read_fasta(args.fasta)
    for name, seq in records:
        result = nussinov_fold(
            seq,
            min_loop_length=args.min_loop_length,
            allow_wobble=not args.no_wobble,
        )
        print(f">{name}")
        print(result.sequence)
        print(result.structure)
        print(f"base_pairs={result.score}")
        print(f"pairs={format_pairs(result.pairs)}")


if __name__ == "__main__":
    main()
