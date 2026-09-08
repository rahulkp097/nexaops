from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from app.rag.embeddings import _mean_pool_normalize, embed_query, init_embedding_model


@pytest.fixture(autouse=True)
def _reset_singletons():
    import app.rag.embeddings as embeddings_module

    embeddings_module._session = None
    embeddings_module._tokenizer = None
    yield
    embeddings_module._session = None
    embeddings_module._tokenizer = None


def test_mean_pool_normalize_ignores_padding_and_normalizes():
    # 1 batch, 3 tokens, hidden dim 2; last token is padding (mask=0)
    last_hidden_state = np.array([[[1.0, 0.0], [3.0, 4.0], [999.0, 999.0]]])
    attention_mask = np.array([[1, 1, 0]])

    result = _mean_pool_normalize(last_hidden_state, attention_mask)

    # mean of [1,0] and [3,4] = [2,2], normalized
    expected = np.array([2.0, 2.0])
    expected = expected / np.linalg.norm(expected)
    assert result.shape == (1, 2)
    np.testing.assert_allclose(result[0], expected, rtol=1e-6)
    assert np.isclose(np.linalg.norm(result[0]), 1.0)


@patch("app.rag.embeddings.hf_hub_download")
@patch("app.rag.embeddings.Tokenizer")
@patch("app.rag.embeddings.onnxruntime.InferenceSession")
async def test_embed_query_never_touches_the_network(mock_session_cls, mock_tokenizer_cls, mock_hf_download):
    mock_hf_download.side_effect = lambda repo_id, filename, cache_dir: f"/fake/{filename}"

    mock_tokenizer = MagicMock()
    mock_encoding = MagicMock()
    mock_encoding.ids = [101, 2054, 102]
    mock_encoding.attention_mask = [1, 1, 1]
    mock_tokenizer.encode.return_value = mock_encoding
    mock_tokenizer_cls.from_file.return_value = mock_tokenizer

    mock_session = MagicMock()
    fake_hidden_state = np.random.rand(1, 3, 384).astype(np.float32)
    mock_session.run.return_value = [fake_hidden_state]
    mock_session_cls.return_value = mock_session

    await init_embedding_model()
    vector = await embed_query("what is the refund policy?")

    assert len(vector) == 384
    assert mock_hf_download.call_count == 2
    mock_tokenizer.enable_truncation.assert_called_once_with(max_length=256)
