from app.evaluation import scoring


def test_contains_passes_when_no_expectation_is_configured():
    assert scoring.contains("anything, or even nothing", None) is True
    assert scoring.contains(None, None) is True


def test_contains_is_case_insensitive_substring_match():
    assert scoring.contains("Refunds take 30 days.", "30 days") is True
    assert scoring.contains("Refunds take 30 days.", "REFUNDS") is True
    assert scoring.contains("Refunds take 30 days.", "60 days") is False


def test_contains_fails_when_needle_given_but_no_answer():
    assert scoring.contains(None, "something") is False
    assert scoring.contains("", "something") is False


def test_score_sources_with_no_expectation_trivially_passes():
    assert scoring.score_sources([], []) == (1.0, 1.0)
    assert scoring.score_sources([], ["policy.pdf"]) == (1.0, 1.0)


def test_score_sources_recall_hits_when_an_expected_filename_is_returned():
    recall, citation = scoring.score_sources(["policy.pdf"], ["policy.pdf", "unrelated.txt"])
    assert recall == 1.0
    assert citation == 0.5  # 1 of 2 returned sources was expected


def test_score_sources_recall_misses_when_no_expected_filename_is_returned():
    recall, citation = scoring.score_sources(["policy.pdf"], ["unrelated.txt"])
    assert recall == 0.0
    assert citation == 0.0


def test_score_sources_citation_is_zero_when_nothing_was_returned_but_something_was_expected():
    recall, citation = scoring.score_sources(["policy.pdf"], [])
    assert recall == 0.0
    assert citation == 0.0


def test_score_faithfulness_with_no_citation_markers_trivially_passes():
    assert scoring.score_faithfulness("Refunds take 30 days.", num_sources=2) == 1.0
    assert scoring.score_faithfulness("Refunds take 30 days.", num_sources=0) == 1.0


def test_score_faithfulness_passes_when_every_marker_is_in_range():
    assert scoring.score_faithfulness("Refunds take 30 days [1], per policy [2].", num_sources=2) == 1.0


def test_score_faithfulness_fails_when_a_marker_cites_a_nonexistent_source():
    assert scoring.score_faithfulness("Refunds take 30 days [3].", num_sources=2) == 0.0


def test_admits_insufficient_evidence_recognizes_the_documented_phrases():
    assert scoring.admits_insufficient_evidence("The available documents don't contain enough information.")
    assert scoring.admits_insufficient_evidence("I'm not able to answer that question based on the evidence.")


def test_admits_insufficient_evidence_is_false_for_a_confident_answer():
    assert not scoring.admits_insufficient_evidence("Refunds take 30 days.")
