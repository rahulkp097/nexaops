def org_key(organization_id: str, *parts: str) -> str:
    """Namespaces a Redis key by organization, per spec §8/§29. No real org
    context exists until Phase 2 adds auth — this is the convention future
    callers build on."""
    return ":".join(["org", organization_id, *parts])
