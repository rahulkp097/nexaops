from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: UUID
    document_id: UUID
    filename: str
    content: str
    page_number: int | None
    score: float

    @classmethod
    def from_row(cls, row: Any) -> "RetrievedChunk":
        return cls(
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            filename=row["filename"],
            content=row["content"],
            page_number=row["page_number"],
            score=float(row["score"]),
        )
