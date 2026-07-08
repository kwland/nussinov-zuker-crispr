# RNA Folding and CRISPR Guide Analysis

This project predicts RNA secondary structure with the Nussinov algorithm and applies it to CRISPR guide RNA spacers.

## Run the Nussinov Algorithm

```bash
python nussinov.py --sequence GGGAAACCC
```

Expected output includes the normalized RNA sequence, dot-bracket structure, maximum base-pair count, and one-based paired positions.

## Run the CRISPR Guide Demo

```bash
python crispr_nussinov_analysis.py
```

This reads `data/crispr_guide_examples.csv` and writes:

```text
analysis_outputs/crispr_guide_nussinov_features.csv
```

The most useful columns are:

- `gc_percent`: percent G/C bases in the spacer.
- `nussinov_pairs`: maximum number of predicted self-pairs.
- `self_pair_fraction`: fraction of spacer bases involved in predicted self-pairing.
- `dot_bracket`: predicted spacer fold.
- `seed_region_1_based`: PAM-proximal seed positions.
- `seed_accessibility`: fraction of seed bases predicted to be unpaired.
- `design_warning`: simple warning labels for bad-control style sequences.
- `analysis_status`: `ok` for folded rows, or `needs_sequence` for known-guide placeholders.

## Comparison Set

The default CSV follows the checkpoint advice:

- 2 known-guide slots to fill with exact published or class-provided guide spacers.
- 2 random 20-nt controls.
- 2 bad/stress-test controls.

Replace `REPLACE_WITH_20NT_SPACER` before making the final plot or conclusion.

## How This Connects to CRISPR

For SpCas9, the guide spacer is usually 20 nt and binds the DNA target next to an NGG PAM. The PAM-proximal seed region is especially important for target recognition. If the guide folds back on itself, that region may be less available to bind DNA, so the guide may work worse.

This code tests that idea in a simple way. It does not replace ViennaRNA or a full CRISPR scoring model, but it gives a clear computational biology story: build the dynamic-programming fold, turn the fold into features, and compare those features with public guide-activity data.

## Website

The GitHub Pages-ready website is in `docs/`.

Local preview:

```bash
python -m http.server 8000 -d docs
```

GitHub Pages setup notes are in `GITHUB_PAGES_SETUP.md`.
