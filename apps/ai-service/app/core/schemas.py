from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for any DTO crossing the wire to/from the gateway: camelCase
    JSON (documentId, chunkId, ...), matching the gateway's own convention,
    while Python code stays snake_case."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
