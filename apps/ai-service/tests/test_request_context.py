from app.core.request_context import get_request_id, reset_request_id, set_request_id


def test_get_request_id_defaults_to_a_placeholder():
    assert get_request_id() == "-"


def test_set_request_id_is_visible_until_reset():
    token = set_request_id("req-1")
    try:
        assert get_request_id() == "req-1"
    finally:
        reset_request_id(token)

    assert get_request_id() == "-"
