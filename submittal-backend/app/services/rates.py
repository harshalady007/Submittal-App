"""Rate lookup table — ported exactly from the n8n BOQ workflow.

Case-insensitive substring match on the description, first match wins, default 0.
"""


def get_rate(desc: str) -> int:
    d = (desc or "").lower()
    if "bench" in d or "seat" in d:
        return 2000
    if "bollard" in d:
        return 600
    if "bike" in d or "bikerack" in d:
        return 800
    if "tree grate" in d:
        return 2500
    if "planter" in d:
        return 1500
    if "litter bin" in d or "litterbin" in d:
        return 1500
    if "recycle bin" in d or "recycle/general" in d:
        return 3000
    if "railing" in d:
        return 2000
    return 0
