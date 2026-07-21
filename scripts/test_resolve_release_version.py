import unittest

from scripts.resolve_release_version import parse_internal_version, resolve_release_version


class ResolveReleaseVersionTests(unittest.TestCase):
    def test_increments_latest_patch(self) -> None:
        self.assertEqual(
            resolve_release_version("0.7.93", ["v0.7.99", "v0.7.100"]),
            ("0.7.101", "0.7.101"),
        )

    def test_uses_new_minor_and_pads_public_patch(self) -> None:
        self.assertEqual(
            resolve_release_version("0.8.1", ["v0.7.100"]),
            ("0.8.1", "0.8.01"),
        )

    def test_increments_public_tag_with_leading_zero(self) -> None:
        self.assertEqual(
            resolve_release_version("0.8.1", ["v0.8.01"]),
            ("0.8.2", "0.8.02"),
        )

    def test_rejects_leading_zero_in_internal_version(self) -> None:
        with self.assertRaisesRegex(ValueError, "without leading zeroes"):
            parse_internal_version("0.8.01")


if __name__ == "__main__":
    unittest.main()
