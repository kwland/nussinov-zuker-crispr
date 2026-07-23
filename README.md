# RNA folding for CRISPR guide exploration

[![tests](https://github.com/kwland/nussinov-zuker-crispr/actions/workflows/tests.yml/badge.svg)](https://github.com/kwland/nussinov-zuker-crispr/actions/workflows/tests.yml)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-2f7d62)](https://www.python.org/)
[![MIT License](https://img.shields.io/badge/license-MIT-d6a84a)](LICENSE)

**Live interactive demo:** <https://kwland.github.io/nussinov-zuker-crispr/>

This project asks a simple biological question: if a CRISPR guide RNA folds back on itself, does that make its targeting sequence less available to bind DNA?

I built an explainable Nussinov folding implementation in Python, then extended the idea into an interactive browser lab that compares Nussinov with a simplified Zuker-style energy model. The goal is not to replace established tools such as ViennaRNA. It is to make the algorithm, assumptions, and failure modes easy to inspect.

The early result is useful even though it is negative: seed accessibility by itself did not predict editing efficiency in the pooled dataset used by the website. That points toward a more realistic next question—whether structure adds information when it is combined with sequence and genomic context.

![Four-step Nussinov workflow](figures/nussinov_workflow.svg)

## What is included

- `nussinov.py` — a dependency-free Nussinov dynamic-programming implementation with FASTA and single-sequence command-line input.
- `crispr_nussinov_analysis.py` — batch feature extraction for 20 nt spacer sequences, including G/C content, self-pairing, and seed accessibility.
- `test_nussinov.py` — unit and small integration tests for folding, validation, FASTA parsing, and CSV analysis.
- `examples/` — concrete FASTA and CSV inputs that run as written.
- `make_figures.py` and `figures/` — reproducible, dependency-free SVG figures.
- `docs/` — the static interactive site used for the fuller Nussinov/Zuker demonstration.
- `ANALYSIS.md` — a concise account of the question, methods, current evidence, and limitations.

One distinction matters: the **Python analysis folds the spacer alone**. The website's guide Analyzer can fold the spacer together with the standard sgRNA scaffold. Results from those two paths should not be treated as identical.

## Installation

The core code uses only the Python standard library and requires Python 3.10 or newer.

### Run directly from the repository

```bash
git clone https://github.com/kwland/nussinov-zuker-crispr.git
cd nussinov-zuker-crispr

python --version
python nussinov.py --sequence GGGAAACCC
```

No package installation is required for this route.

### Optional editable install

An editable install provides the `rna-fold` and `crispr-guide-features` commands:

```bash
python -m venv .venv

# macOS or Linux
source .venv/bin/activate

# Windows PowerShell
# .venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -e .
```

Then run:

```bash
rna-fold --sequence GGGAAACCC
crispr-guide-features --input examples/guides.csv --output guide_features.csv
```

## Reproduce the examples

Fold all sequences in the example FASTA file:

```bash
python nussinov.py --fasta examples/sequences.fasta
```

Analyze the example CRISPR spacers:

```bash
python crispr_nussinov_analysis.py \
  --input examples/guides.csv \
  --output analysis_outputs/example_guide_features.csv
```

Regenerate the repository's batch output and figures:

```bash
python crispr_nussinov_analysis.py
python make_figures.py
```

The committed guide examples are synthetic demonstrations. They are useful for checking the pipeline and its warning flags, but they do not carry measured editing-efficiency labels.

![Synthetic guide feature comparison](figures/guide_feature_summary.svg)

## Run the tests

```bash
python -m unittest discover -v
```

The test suite checks:

- DNA-to-RNA normalization and invalid character handling;
- canonical and G–U wobble pairing rules;
- a hand-checkable hairpin and a wobble-sensitive fold;
- empty inputs and invalid parameter values;
- multi-record FASTA parsing and malformed FASTA rejection;
- CRISPR seed accessibility; and
- end-to-end CSV feature generation.

GitHub Actions runs the same suite on Python 3.10 and 3.12 and exercises both documented example commands.

## Preview the interactive site

The site is static and needs no JavaScript build step:

```bash
python -m http.server 8000 -d docs
```

Open <http://127.0.0.1:8000/>. The site includes:

- side-by-side Nussinov and simplified Zuker-style folding;
- arc diagrams, dynamic-programming grids, and a schematic 3D view;
- spacer-plus-scaffold guide analysis;
- an NGG PAM guide finder;
- a view of the pooled guide dataset; and
- small reference comparisons against known structures and precomputed ViennaRNA results.

## How the Python model works

For a sequence interval `(i, j)`, Nussinov dynamic programming considers four possibilities: leave the left base unpaired, leave the right base unpaired, pair the two ends when allowed, or split the interval. It stores the largest achievable number of non-crossing pairs, then traces back one optimal structure.

This gives an interpretable baseline rather than a thermodynamic prediction. Every allowed A–U, G–C, or optional G–U pair contributes the same score.

## Current findings

The browser demonstration reports three kinds of checks:

1. Small structural comparisons against hand-selected reference structures.
2. Energy and base-pair agreement with precomputed ViennaRNA results for a limited sgRNA panel.
3. Seed-accessibility comparisons against a pooled set of 4,685 guide measurements.

In that pooled set, seed accessibility alone was essentially uncorrelated with editing efficiency, while G/C content had only a weak association. These are exploratory results, not a validated predictive model. See [ANALYSIS.md](ANALYSIS.md) for the interpretation and scope.

## Limitations

- **Nussinov optimizes pair count, not free energy.** It often over-pairs and cannot distinguish a plausible stable structure from a structure with the same number of weaker pairs.
- **The Python feature path folds only the spacer.** It omits the sgRNA scaffold, even though spacer–scaffold interactions can matter.
- **The browser energy model is simplified.** Its loop, wobble, and multiloop terms are approximations, so its energies should be used for explanation and ranking—not as replacements for ViennaRNA values.
- **Only pseudoknot-free secondary structures are represented.** Tertiary interactions, kinetics, alternative conformations, and RNA–protein interactions are outside the model.
- **Guide activity is not structure alone.** Chromatin accessibility, target context, nuclease choice, expression, off-target binding, and DNA repair all contribute.
- **The pooled activity labels come from different screens.** Within-dataset normalization helps comparison but does not make the experiments identical.
- **The validation set is small.** Strong agreement on a few chosen structures is a useful smoke test, not evidence of broad structural accuracy.
- **The 3D view is illustrative.** It is a layout of the predicted secondary structure, not a molecular or atomistic model.
- **The included Python example guides are synthetic.** They demonstrate reproducibility and warnings; they do not establish biological performance.

## Repository layout

```text
.
├── nussinov.py
├── crispr_nussinov_analysis.py
├── make_figures.py
├── test_nussinov.py
├── pyproject.toml
├── examples/
│   ├── sequences.fasta
│   └── guides.csv
├── data/
│   └── crispr_guide_examples.csv
├── analysis_outputs/
│   └── crispr_guide_nussinov_features.csv
├── figures/
│   ├── nussinov_workflow.svg
│   └── guide_feature_summary.svg
├── docs/
│   ├── index.html
│   ├── styles.css
│   ├── js/
│   └── data/
└── notes/
```

## Data and credit

The website's pooled guide dataset, compact efficiency model, and precomputed ViennaRNA comparison data were contributed by Thomas Yu for the group project. The guide activity measurements originate from Doench et al. (2014, 2016) and were pooled through CRISPOR / Haeussler et al. (2016). The folding and interface code in this repository were written by Linus Tan.

Key references:

- Nussinov and Jacobson (1980), *PNAS* — base-pair maximization.
- Zuker and Stiegler (1981), *Nucleic Acids Research* — minimum-free-energy folding.
- Xia et al. (1998), *Biochemistry* — nearest-neighbor parameters.
- Doench et al. (2016), *Nature Biotechnology* — Rule Set 2 guide activity.
- Haeussler et al. (2016), *Genome Biology* — CRISPOR.
- [ViennaRNA Package](https://www.tbi.univie.ac.at/RNA/).

## License

MIT. See [LICENSE](LICENSE).

---

I built this as an explainable research prototype: small enough to inspect, honest about where it fails, and useful as a starting point for a stronger model. Questions, corrections, and collaboration are welcome.
