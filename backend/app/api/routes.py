from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from app import services
from app.api import schemas
from app.config import DEFAULT_GATE, DEFAULT_SOURCE

router = APIRouter()

GateId = Annotated[Literal["epex_60", "n2ex", "epex_30"], Query(description="Auction gate")]
DeliveryDate = Annotated[date, Query(description="Delivery day D (gate is on D-1)")]
Source = Annotated[
    Literal["snapshot", "live"],
    Query(description="'snapshot' = bundled extract; 'live' = fetched from Elexon (cached)"),
]


def _call(fn, *args):
    try:
        return fn(*args)
    except services.NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/meta", response_model=schemas.Meta)
def meta(source: Source = DEFAULT_SOURCE):
    return services.meta(source)


@router.post("/live/refresh", response_model=schemas.Meta)
def refresh_live():
    """Force a re-fetch from Elexon now (otherwise live data is cached for the TTL)."""
    return services.refresh_live()


@router.get("/cockpit", response_model=schemas.Cockpit)
def cockpit(delivery_date: DeliveryDate, gate: GateId = DEFAULT_GATE,
            source: Source = DEFAULT_SOURCE):
    return _call(services.cockpit, delivery_date, gate, source)


@router.get("/accuracy", response_model=schemas.Accuracy)
def accuracy(
    gate: GateId = DEFAULT_GATE,
    from_: Annotated[
        date | None, Query(alias="from", description="Defaults to the first delivery day")
    ] = None,
    to: Annotated[date | None, Query(description="Defaults to the last delivery day")] = None,
    source: Source = DEFAULT_SOURCE,
):
    return _call(services.accuracy, gate, from_, to, source)


@router.get("/drift", response_model=schemas.Drift)
def drift(delivery_date: DeliveryDate, source: Source = DEFAULT_SOURCE):
    return _call(services.drift, delivery_date, source)


@router.get("/buffer", response_model=schemas.Buffer)
def buffer(
    delivery_date: DeliveryDate,
    gate: GateId = DEFAULT_GATE,
    confidence: Annotated[float, Query(ge=0.5, le=0.99)] = 0.9,
    source: Source = DEFAULT_SOURCE,
):
    return _call(services.buffer, delivery_date, gate, round(confidence, 2), source)


@router.get("/explorer", response_model=schemas.Explorer)
def explorer(
    from_: Annotated[date, Query(alias="from")],
    to: date,
    horizon_h: Annotated[float, Query(ge=0, le=48)] = 24,
    source: Source = DEFAULT_SOURCE,
):
    return _call(services.explorer, from_, to, horizon_h, source)
