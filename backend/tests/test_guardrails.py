from app.services.guardrails import clamp_discount


def test_clamp_discount_within_limit():
    assert clamp_discount(8, 10) == 8


def test_clamp_discount_exceeds_limit():
    assert clamp_discount(25, 15) == 15


def test_clamp_discount_negative():
    assert clamp_discount(-5, 10) == 0


def test_clamp_discount_none():
    assert clamp_discount(None, 10) == 0
