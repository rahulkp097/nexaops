import re

# Structural, LLM-independent scoring helpers. None of these are an
# LLM-as-judge — spec §26 lists metrics like "answer correctness" and
# "faithfulness" that are conventionally judged by another model call, but
# this project already has zero real answers to judge (the account's known
# zero-credit-balance gap) and "no paid AI service required for the local
# MVP" as a stated non-goal — so every score here is a cheap, honest proxy
# computed from structured data the pipelines already return, documented as
# a proxy at each function rather than presented as equivalent to a judged
# score.

_INSUFFICIENT_EVIDENCE_MARKERS = (
    "insufficient",
    "don't contain enough information",
    "not able to answer",
    "doesn't contain enough information",
)


def contains(haystack: str | None, needle: str | None) -> bool:
    """Case-insensitive substring check. A missing `needle` (no expectation
    configured) always passes."""
    if not needle:
        return True
    if not haystack:
        return False
    return needle.lower() in haystack.lower()


def score_sources(expected_sources: list[str], returned_filenames: list[str]) -> tuple[float, float]:
    """Returns (recall_at_k, citation_accuracy).

    recall_at_k: 1.0 if at least one expected filename was retrieved, else
    0.0 — spec's "relevant evidence retrieved". No expectation configured
    trivially passes (1.0), since some categories (e.g. NO_ANSWER) expect
    zero specific sources by design.

    citation_accuracy: the fraction of *returned* sources that are in the
    expected set — a structural proxy for "source actually supports claim"
    that can't tell whether a legitimately-relevant extra source was
    retrieved versus a genuinely wrong one; it only catches the case where
    none of the expectations were met at all.
    """
    if not expected_sources:
        return 1.0, 1.0
    recall = 1.0 if any(f in returned_filenames for f in expected_sources) else 0.0
    if not returned_filenames:
        return recall, 0.0
    matching = sum(1 for f in returned_filenames if f in expected_sources)
    return recall, matching / len(returned_filenames)


def score_faithfulness(answer: str, num_sources: int) -> float:
    """Structural proxy for "answer supported by evidence": every inline
    [n] citation marker in the answer must reference an actual retrieved
    source index. Catches one concrete hallucination shape (citing a
    source that doesn't exist) without needing an LLM judge; it says
    nothing about whether prose *without* a marker is actually grounded."""
    markers = {int(m) for m in re.findall(r"\[(\d+)\]", answer)}
    if not markers:
        return 1.0
    return 1.0 if all(1 <= m <= num_sources for m in markers) else 0.0


def admits_insufficient_evidence(answer: str) -> bool:
    lowered = answer.lower()
    return any(marker in lowered for marker in _INSUFFICIENT_EVIDENCE_MARKERS)
