import logging

from app.core.logging_config import RequestIdFilter, configure_logging
from app.core.request_context import reset_request_id, set_request_id


def _make_record() -> logging.LogRecord:
    return logging.LogRecord(
        name="app.test", level=logging.INFO, pathname=__file__, lineno=1, msg="hello", args=(), exc_info=None
    )


def test_request_id_filter_stamps_the_current_request_id():
    token = set_request_id("req-1")
    try:
        record = _make_record()
        assert RequestIdFilter().filter(record) is True
        assert record.request_id == "req-1"
    finally:
        reset_request_id(token)


def test_request_id_filter_stamps_the_placeholder_outside_a_request():
    record = _make_record()

    RequestIdFilter().filter(record)

    assert record.request_id == "-"


def test_configure_logging_installs_a_single_handler_with_the_request_id_filter():
    root = logging.getLogger()
    original_handlers = list(root.handlers)
    original_level = root.level
    try:
        configure_logging(level=logging.WARNING)

        assert len(root.handlers) == 1
        assert root.level == logging.WARNING
        assert any(isinstance(f, RequestIdFilter) for f in root.handlers[0].filters)
    finally:
        root.handlers = original_handlers
        root.setLevel(original_level)
