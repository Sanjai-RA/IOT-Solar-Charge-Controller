# MPPT Solar — Intelligent Monitoring Dashboard (Python backend)

Flask backend + the same animated dashboard UI. Live data from ThingSpeak channel **3534436**.

```
python -m venv venv
venv\Scripts\activate          (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
python app.py
```
Open the URL printed in the terminal (e.g. http://127.0.0.1:5000 or http://<your-LAN-IP>:5000).

## Structure
```
app.py                     Flask server: API + serves the dashboard, prints IP
backend/thingspeak_client.py  ThingSpeak reader (key from .env, timeout, cache, validation)
backend/forecast.py        Forecast engine (pure Python): persistence, moving avg, damped Holt,
                           ridge autoregression (learned), time-of-day seasonal; chronological 80/20 backtest
static_site/               Pre-built dashboard (HTML/JS/CSS) — served by Flask, no Node.js needed
frontend/                  Dashboard source (Next.js/React). Only needed if you want to edit the UI.
.env                       Channel ID + Read API Key (server only)
```

## API (Python)
| Endpoint | Purpose |
|---|---|
| `GET /api/telemetry?range=latest|1h|6h|24h|7d|custom&start=&end=` | normalized readings (field1–4) |
| `GET /api/forecast?metric=solarPower&horizon=30|60|180&pol=&maxAge=` | forecast + uncertainty + model comparison |
| `GET /api/status[?test=1]` | connection diagnostics (no keys exposed) |

| Field | Name | Unit |
|---|---|---|
| field1 | solar_panel_voltage | V |
| field2 | solar_panel_current | A |
| field3 | battery_voltage | V |
| field4 | battery_current | A |

## Editing the UI (optional, needs Node.js 18+)
```
cd frontend
npm install
npm run build          -> creates frontend/out
```
Then replace the `static_site` folder with the new `frontend/out` folder.
