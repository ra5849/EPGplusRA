"""Tests de zona horaria: Europe/Madrid, CET/CEST y transiciones.

Un día no siempre tiene 24 horas; la conversión debe usar la base de datos
de zonas (tzdata) y nunca aritmética manual sobre strings.
"""

from datetime import datetime, timedelta

import pytest
from zoneinfo import ZoneInfo

from collector import config

TZ = ZoneInfo(config.TIMEZONE)
UTC = ZoneInfo("UTC")


def to_utc(dt_naive: datetime) -> datetime:
    """Comodín de test: naive asumido en Europe/Madrid -> UTC aware."""
    return dt_naive.replace(tzinfo=TZ).astimezone(UTC)


class TestCET:
    def test_winter_offset(self):
        dt = datetime(2026, 1, 15, 12, 0)
        assert dt.replace(tzinfo=TZ).utcoffset() == timedelta(hours=1)


class TestCEST:
    def test_summer_offset(self):
        dt = datetime(2026, 8, 15, 12, 0)
        assert dt.replace(tzinfo=TZ).utcoffset() == timedelta(hours=2)


class TestTransitions:
    def test_invierno_verano(self):
        """2026: último domingo de marzo (29/03) 02:00 CET -> 03:00 CEST."""
        before = datetime(2026, 3, 29, 1, 59, tzinfo=TZ)
        after = datetime(2026, 3, 29, 3, 0, tzinfo=TZ)
        # 01:59 CET -> 02:59 CEST (salta una hora)
        utc_before = before.astimezone(UTC)
        utc_after = after.astimezone(UTC)
        assert utc_after - utc_before == timedelta(seconds=60)

    def test_verano_invierno(self):
        """2026: último domingo de octubre (25/10) 03:00 CEST -> 02:00 CET.

        A las 02:30 hay dos lecturas posibles: CEST (fold=0) y CET (fold=1).
        Están separadas una hora en UTC.
        """
        first = datetime(2026, 10, 25, 2, 30, tzinfo=TZ, fold=0)  # CEST
        second = datetime(2026, 10, 25, 2, 30, tzinfo=TZ, fold=1)  # CET
        assert first.astimezone(UTC) + timedelta(hours=1) == second.astimezone(UTC)

    def test_sept_day_has_24h(self):
        d1 = datetime(2026, 9, 15, 12, 0, tzinfo=TZ)
        d2 = datetime(2026, 9, 16, 12, 0, tzinfo=TZ)
        delta = d2.astimezone(UTC) - d1.astimezone(UTC)
        assert delta == timedelta(hours=24)

    def test_oct_day_has_25h(self):
        # 25/10 00:00 CEST -> 26/10 00:00 CET (el reloj retrocede a las 03:00)
        d1 = datetime(2026, 10, 25, 0, 0, tzinfo=TZ)
        d2 = datetime(2026, 10, 26, 0, 0, tzinfo=TZ)
        delta = d2.astimezone(UTC) - d1.astimezone(UTC)
        assert delta == timedelta(hours=25)

    def test_march_day_has_23h(self):
        """29/03 00:00 CET -> 30/03 00:00 CEST (el reloj avanza a las 02:00)."""
        d1 = datetime(2026, 3, 29, 0, 0, tzinfo=TZ)
        d2 = datetime(2026, 3, 30, 0, 0, tzinfo=TZ)
        delta = d2.astimezone(UTC) - d1.astimezone(UTC)
        assert delta == timedelta(hours=23)

    def test_midnight_crossing(self):
        """Programa 23:30 -> 01:15 debe convertirse sin asumir el mismo día."""
        start = datetime(2026, 1, 10, 23, 30, tzinfo=TZ)
        end = datetime(2026, 1, 11, 1, 15, tzinfo=TZ)
        assert (end - start) == timedelta(hours=1, minutes=45)
        assert start.astimezone(UTC).date() == datetime(2026, 1, 10, 22, 30, tzinfo=UTC).date()


class TestParseTs:
    """parse de ISO 8601 con zona (como hace el validator)."""

    def test_z_and_offset_equivalent(self):
        from collector.validator import parse_ts

        a = parse_ts("2026-08-08T12:00:00Z")
        b = parse_ts("2026-08-08T14:00:00+02:00")
        assert a == b

    def test_invalid_returns_none(self):
        from collector.validator import parse_ts

        assert parse_ts("no-ts") is None
        assert parse_ts(None) is None


@pytest.mark.parametrize("hours", [0, 1, 23])
def test_hour_roundtrip(hours):
    """ISO local→UTC→local no debe desviarse."""
    iso = f"2026-08-08T{hours:02d}:00:00"
    dt = iso + "+02:00"  # agosto, CEST
    back = datetime.fromisoformat(dt).astimezone(TZ)
    assert back.hour == hours