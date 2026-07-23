# Preliminary analysis

## Can RNA secondary structure help explain CRISPR guide activity?

Linus Tan · July 2026 · **exploratory research prototype**

This project began with an intuitive question: a CRISPR guide has to expose its targeting sequence to DNA, so could self-folding—especially within the PAM-proximal seed—make a guide less effective?

The answer from the current dataset is: **not on its own**. That negative result is still informative. It suggests that a single folding feature is too small a view of a biological process shaped by sequence, chromatin, expression, nuclease behavior, and repair context.

## Hypothesis

SpCas9 guides contain a roughly 20 nt spacer. Target recognition is particularly sensitive to the PAM-proximal seed, represented here as the last eight spacer bases. The working hypothesis was:

> Guides with more unpaired seed bases will tend to have higher measured editing activity.

If this relationship were strong, seed accessibility could serve as a cheap, sequence-only design feature.

## Methods

### Folding models

- **Nussinov** finds a pseudoknot-free structure with the largest number of allowed base pairs. It is transparent and easy to trace, but it is not a physical energy model.
- **The browser's Zuker-style model** scores stacking and loop terms to seek a lower-energy structure. Watson–Crick stacking uses published nearest-neighbor parameters; several other terms are simplified approximations.

The dependency-free Python pipeline currently folds each **spacer by itself**. The browser Analyzer can optionally append the standard 76 nt sgRNA scaffold before folding. This distinction matters because a spacer may pair with the scaffold.

### Guide features

The Python batch analysis reports:

- spacer length and G/C percentage;
- Nussinov pair count and paired-base fraction;
- one optimal dot-bracket structure;
- paired bases within the last-eight-base seed;
- seed accessibility, defined as the fraction of seed positions left unpaired; and
- simple warnings for length, extreme G/C, poly-T, and a mostly paired seed.

### Browser checks

The interactive site adds three exploratory checks:

1. Pair-level F1 against three selected reference structures.
2. Agreement with precomputed ViennaRNA structures and energies for 30 sgRNAs.
3. Seed accessibility versus editing efficiency in 4,685 pooled guide measurements from Doench 2014 and 2016, provided through CRISPOR and normalized within source datasets.

## Results

### Small structure checks

| Reference structure | Zuker-style F1 | Nussinov F1 | ViennaRNA F1 |
|---|---:|---:|---:|
| Designed hairpin (12 nt) | 1.00 | 1.00 | 1.00 |
| Two hairpins (20 nt) | 1.00 | 1.00 | 1.00 |
| Yeast tRNA-Phe (76 nt) | 1.00 | 0.20 | 1.00 |

The selected examples show the expected contrast: base-pair counting works on simple hairpins but over-pairs the branched tRNA structure. Exact agreement on this tiny, hand-selected set is a useful implementation check; it is not a broad accuracy estimate.

### ViennaRNA comparison

For 30 sgRNAs in the browser's reference panel, the simplified Zuker-style energies correlate with precomputed ViennaRNA energies at approximately **Pearson r = 0.87** and recover about 70% of ViennaRNA's base pairs on average. The browser energies are systematically less negative, consistent with omitted or simplified energy terms.

This comparison supports using the browser model as an educational approximation and ranking aid. It does not make the model interchangeable with ViennaRNA.

### Guide activity

Across the pooled 4,685-guide dataset, seed accessibility alone is essentially uncorrelated with editing efficiency (**Spearman ρ ≈ 0.01**). G/C content has a weak positive association (**ρ ≈ 0.13**) but is not a useful standalone predictor either.

A faint relationship seen in an earlier, smaller subset did not persist in the larger pooled set. The present data therefore do not support the original single-feature hypothesis.

## Interpretation

Three conclusions seem reasonable at this stage:

1. The implementations are understandable and pass small reference checks, which makes them useful for teaching and for prototyping features.
2. Seed accessibility alone is not enough to explain guide activity in the current pooled data.
3. The next meaningful test is incremental: determine whether folding features improve a sequence-and-context baseline on held-out data.

## Limitations

- Nussinov rewards every allowed pair equally and does not model thermodynamic stability.
- The Python analysis folds the spacer alone; the browser Analyzer and Designer can include the scaffold.
- The browser's Zuker-style loop, wobble, and multiloop terms are simplified.
- The models exclude pseudoknots, folding kinetics, alternative conformations, tertiary interactions, and RNA–protein binding.
- The 3D visualization is schematic rather than molecular.
- The structure reference set and ViennaRNA panel are small and selected, so performance estimates may not generalize.
- ViennaRNA values are precomputed rather than generated in the browser.
- Guide labels are pooled across screens and normalized within their original datasets; laboratory conditions are not identical.
- Chromatin, target context, repair pathway, guide expression, off-target effects, and nuclease-specific behavior are not modeled.
- The committed Python example guides are synthetic and have no measured activity labels.
- Correlation does not establish that structure causes a change in editing activity.

## Next steps

1. Reproduce the 4,685-guide analysis end to end in Python with explicit data-cleaning and dataset-level splits.
2. Compare spacer-only and spacer-plus-scaffold features on the same guides.
3. Add structure features to a documented sequence baseline and evaluate the change on held-out datasets.
4. Benchmark a Python energy model against ViennaRNA on a larger, independently sampled panel.
5. Validate any surviving signal in an independent screen and, eventually, in prospective experiments.

---

This is a careful first pass, not a finished predictive system. The code is intended to make the assumptions inspectable and the next experiment easier to design.
