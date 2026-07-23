import csv
import tempfile
import unittest
from pathlib import Path

from nussinov import can_pair, normalize_rna, nussinov_fold, read_fasta
from crispr_nussinov_analysis import analyze_guides, score_guide


class NussinovTests(unittest.TestCase):
    def test_normalize_accepts_dna(self):
        self.assertEqual(normalize_rna("gggtttccc"), "GGGUUUCCC")

    def test_canonical_and_wobble_pairs(self):
        self.assertTrue(can_pair("G", "C"))
        self.assertTrue(can_pair("G", "U"))
        self.assertFalse(can_pair("G", "U", allow_wobble=False))
        self.assertFalse(can_pair("A", "C"))

    def test_simple_hairpin(self):
        result = nussinov_fold("GGGAAACCC")
        self.assertEqual(result.score, 3)
        self.assertEqual(result.structure, "(((...)))")
        self.assertEqual(result.pairs, [(0, 8), (1, 7), (2, 6)])

    def test_empty_sequence(self):
        result = nussinov_fold("")
        self.assertEqual(result.score, 0)
        self.assertEqual(result.structure, "")
        self.assertEqual(result.pairs, [])

    def test_invalid_sequence_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "non-RNA bases"):
            nussinov_fold("AUGX")

    def test_negative_loop_length_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "non-negative"):
            nussinov_fold("GGGAAACCC", min_loop_length=-1)

    def test_wobble_setting_changes_fold(self):
        with_wobble = nussinov_fold("GAAAU")
        without_wobble = nussinov_fold("GAAAU", allow_wobble=False)
        self.assertEqual(with_wobble.score, 1)
        self.assertEqual(without_wobble.score, 0)

    def test_crispr_features_include_seed_accessibility(self):
        features = score_guide("GCGCGATACGCGTATCGCGC")
        self.assertEqual(features["length"], "20")
        self.assertEqual(features["seed_region_1_based"], "13-20")
        self.assertEqual(features["seed_accessibility"], "0.000")
        self.assertIn("seed_mostly_paired", features["design_warning"])

    def test_seed_length_must_be_positive(self):
        with self.assertRaisesRegex(ValueError, "positive integer"):
            score_guide("GCGCGATACGCGTATCGCGC", seed_length=0)

    def test_read_fasta_supports_multiple_records(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.fasta"
            path.write_text(">hairpin\nGGGAAA\nCCC\n>dna_example\nGCGCTTTGCGC\n", encoding="utf-8")
            self.assertEqual(
                read_fasta(path),
                [("hairpin", "GGGAAACCC"), ("dna_example", "GCGCTTTGCGC")],
            )

    def test_read_fasta_rejects_missing_header(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.fasta"
            path.write_text("GGGAAACCC\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "before a header"):
                read_fasta(path)

    def test_csv_analysis_runs_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            input_path = Path(directory) / "guides.csv"
            output_path = Path(directory) / "features.csv"
            input_path.write_text(
                "name,spacer_dna\nexample,GCGCGATACGCGTATCGCGC\n",
                encoding="utf-8",
            )

            analyze_guides(input_path, output_path, seed_length=8)

            with output_path.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["name"], "example")
            self.assertEqual(rows[0]["analysis_status"], "ok")
            self.assertEqual(rows[0]["seed_accessibility"], "0.000")


if __name__ == "__main__":
    unittest.main()
