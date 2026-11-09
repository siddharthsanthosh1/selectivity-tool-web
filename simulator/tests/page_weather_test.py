"""Browser test of the real-weather and pond-outline features, with the outside services mocked.

Needs Python Playwright with Chromium. Run from the simulator folder after building:
    node tools/build-single.js && python3 tests/page_weather_test.py
No request leaves the machine: Nominatim, Open-Meteo and the USGS map service are all answered
by the fake responses below, so this checks the page's handling, not the services themselves.
"""
import asyncio, json, os, pathlib, sys, math, time, datetime as dt, urllib.parse as up
from playwright.async_api import async_playwright
HERE = pathlib.Path(__file__).resolve().parent.parent
URL = (HERE / 'CyanoSelect-Pond-Simulator.html').as_uri()
OUT = os.environ.get('SHOTS')  # set to a folder to save screenshots
PASS, FAILS = [0], []
def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + (f'  ({info})' if info else ''))
    PASS[0] += ok
    if not ok: FAILS.append(name)
LAT, LON = 35.7327, -78.8503
calls = {'nominatim': 0, 'forecast': [], 'archive': [], 'nhd': []}
FAIL = {'forecast': False}

def hourly(start_date, days):
    t, T, rh, U, D, C, SW = [], [], [], [], [], [], []
    for i in range(days * 24):
        d = start_date + dt.timedelta(hours=i)
        clk = i % 24; day = i // 24
        t.append(d.strftime('%Y-%m-%dT%H:%M'))
        T.append(round(24 + 6 * math.cos(2 * math.pi * (clk - 15) / 24), 1))
        rh.append(round(70 - 20 * math.cos(2 * math.pi * (clk - 15) / 24)))
        U.append(round((4.5 if 10 <= clk <= 19 else 1.2) * (0.8 + 0.4 * math.sin(i * 0.7) ** 2), 2))
        D.append(round((225 if day < 5 else 45) + 15 * math.sin(i * 0.31)) % 360)
        C.append(30)
        el = math.sin(math.pi * (clk - 6.5) / 13) if 6.5 < clk < 19.5 else 0
        SW.append(round(max(0, 850 * el * 0.8)))
    return {'time': t, 'temperature_2m': T, 'relative_humidity_2m': rh, 'wind_speed_10m': U, 'wind_direction_10m': D, 'cloud_cover': C, 'shortwave_radiation': SW}

def square(lat, lon, half_m):
    dlat = half_m / 110540; dlon = half_m / (111320 * math.cos(math.radians(lat)))
    ring = [[lon - dlon, lat - dlat], [lon + dlon, lat - dlat * 0.7], [lon + dlon * 1.2, lat + dlat], [lon - dlon * 0.8, lat + dlat * 1.1], [lon - dlon, lat - dlat]]
    return {'type': 'Polygon', 'coordinates': [ring]}

PONDS = [  # id, name, km2, ftype, center offset (m east, m north), half-size m
    (11, '', 0.0032, 390, (0, 0), 28),
    (12, 'Laurel Pond', 0.0061, 390, (150, 40), 39),
    (13, '', 0.0004, 466, (60, -90), 10),      # swamp: filtered out
    (14, 'Test Lake', 1.3, 436, (0, 380), 0),   # too big
]
def pond_geom(p):
    lat = LAT + p[4][1] / 110540; lon = LON + p[4][0] / (111320 * math.cos(math.radians(LAT)))
    return square(lat, lon, p[5])

async def route(r):
    u = up.urlparse(r.request.url); q = dict(up.parse_qsl(u.query))
    if 'nominatim' in u.netloc:
        calls['nominatim'] += 1
        return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                               body=json.dumps([{'lat': str(LAT), 'lon': str(LON), 'display_name': 'Apex, Wake County, North Carolina, United States'}]))
    if 'archive-api.open-meteo.com' in u.netloc:
        calls['archive'].append(q)
        s = dt.datetime.fromisoformat(q['start_date']); e = dt.datetime.fromisoformat(q['end_date'])
        return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                               body=json.dumps({'timezone': 'America/New_York', 'hourly': hourly(s, (e - s).days + 1)}))
    if 'api.open-meteo.com' in u.netloc:
        calls['forecast'].append(q)
        if FAIL['forecast']:
            return await r.fulfill(status=400, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'error': True, 'reason': 'Test failure'}))
        today = dt.datetime.combine(dt.date.today(), dt.time())
        s = today - dt.timedelta(days=int(q['past_days']))
        return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                               body=json.dumps({'timezone': 'America/New_York', 'hourly': hourly(s, int(q['past_days']) + int(q['forecast_days']))}))
    if 'hydro.nationalmap.gov' in u.netloc:
        calls['nhd'].append(q)
        if q.get('returnGeometry') == 'false':
            feats = [{'type': 'Feature', 'id': p[0], 'geometry': None, 'properties': {'OBJECTID': p[0], 'GNIS_NAME': p[1] or None, 'AREASQKM': p[2], 'FTYPE': p[3]}} for p in PONDS]
        else:
            ids = [int(x) for x in q['objectIds'].split(',')]
            feats = [{'type': 'Feature', 'id': p[0], 'geometry': pond_geom(p), 'properties': {'OBJECTID': p[0], 'GNIS_NAME': p[1] or None, 'AREASQKM': p[2]}} for p in PONDS if p[0] in ids]
        return await r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'type': 'FeatureCollection', 'features': feats}))
    return await r.continue_()

# also wait for the uncertainty runs: with 200 runs (Nov 8, 2026) they finish after the map
READY = "document.getElementById('map-msg').hidden === true && document.getElementById('readouts').children.length > 0 && !document.getElementById('results').classList.contains('updating')"
async def wait_run(pg, extra='true'):
    await asyncio.sleep(0.5)
    await pg.wait_for_function(f"({READY}) && ({extra})", timeout=180000)

async def shot(loc, name):
    if OUT: os.makedirs(OUT, exist_ok=True); await loc.screenshot(path=os.path.join(OUT, name))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1280, 'height': 900})
        await ctx.route('**/*', route)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await wait_run(pg)
        check('starts on the idealized day', (await pg.text_content('#clock')).startswith('Day 1'))
        # 1. find a place -> real weather
        await pg.fill('#place', 'Apex, NC'); await pg.click('#place-find')
        await pg.wait_for_function("document.getElementById('wx-status').textContent.startsWith('Loaded')", timeout=20000)
        check('the place is found', 'Apex' in await pg.text_content('#place-status'))
        check('finding a place switches to real weather', await pg.get_attribute('#wx-real', 'aria-pressed') == 'true' and await pg.evaluate("document.getElementById('wx-ideal-box').hidden"))
        check('a forecast for today says so', 'This is a forecast' in await pg.text_content('#wx-status'))
        q = calls['forecast'][-1]
        check('asks Open-Meteo for the six hourly variables in m/s, local time', set(q['hourly'].split(',')) == set('temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,cloud_cover,shortwave_radiation'.split(',')) and q['wind_speed_unit'] == 'ms' and q['timezone'] == 'auto')
        await wait_run(pg, "/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \\d+/.test(document.getElementById('clock').textContent)")
        check('the clock shows calendar dates', True, await pg.text_content('#clock'))
        check('a wind track is drawn', await pg.evaluate("document.getElementById('tracks').textContent.includes('Wind (mph)')"))
        drift = [t for t in await pg.locator('#events li').all_text_contents() if 'drifted' in t]
        check('the drift event names a compass direction', bool(drift) and 'toward the' in drift[0], drift[0] if drift else 'none')
        notes = [t for t in await pg.locator('#warnings li').all_text_contents() if 'hour by hour' in t]
        check('the notes credit the weather source', bool(notes) and 'Open-Meteo' in notes[0])
        await shot(pg.locator('#pond-section'), 'map-real.png')
        n0 = calls['nominatim']; await pg.click('#place-find'); await asyncio.sleep(0.5)
        check('a repeated search is answered from memory, not sent again', calls['nominatim'] == n0)
        # 2. outline lookup
        await pg.click('#outline-pick button')
        await pg.wait_for_function("document.querySelectorAll('#outline-pick button').length >= 2", timeout=20000)
        btns = await pg.locator('#outline-pick button').all_text_contents()
        check('ponds are listed nearest first, the swamp is left out', len(btns) == 3 and 'point is on it' in btns[0] and 'Laurel Pond' in btns[1], ' | '.join(btns))
        check('a lake over 100 acres is listed but cannot be picked', await pg.locator('#outline-pick button').nth(2).is_disabled())
        await pg.locator('#outline-pick button').first.click(); await wait_run(pg)
        check('picking a pond fills the area and the custom shape', await pg.input_value('#areaAcres') == '0.8' and await pg.input_value('#shape') == 'custom', await pg.input_value('#areaAcres'))
        check('the map says the outline is from USGS', 'USGS' in await pg.text_content('#tools'))
        await shot(pg.locator('#pond-section'), 'map-usgs.png')
        # 3. an old date uses the archive
        await pg.fill('#txDate', '2025-07-15'); await pg.dispatch_event('#txDate', 'change')
        await pg.wait_for_function("document.getElementById('wx-status').textContent.includes('Jul 15')", timeout=20000)
        check('an old date uses the archive, starting two days early', bool(calls['archive']) and calls['archive'][-1]['start_date'] == '2025-07-13' and calls['archive'][-1]['end_date'] == '2025-07-29')
        # 4. too far ahead
        far = (dt.date.today() + dt.timedelta(days=25)).isoformat()
        await pg.evaluate(f"document.getElementById('txDate').max=''; document.getElementById('txDate').value='{far}'"); await pg.dispatch_event('#txDate', 'change'); await asyncio.sleep(0.4)
        check('a date past the forecast is refused and the idealized day is used', 'past the end of the forecast' in await pg.text_content('#wx-status') and not await pg.evaluate("document.getElementById('wx-ideal-box').hidden"))
        # 5. ten days ahead: the forecast covers part of the run and its last day repeats
        soon = (dt.date.today() + dt.timedelta(days=10)).isoformat()
        await pg.fill('#txDate', soon); await pg.dispatch_event('#txDate', 'change')
        await pg.wait_for_function("document.getElementById('wx-status').textContent.startsWith('Loaded')", timeout=20000)
        check('a short forecast is filled by repeating its last day, and says so', 'repeats' in await pg.text_content('#wx-status') and calls['forecast'][-1]['forecast_days'] == '16')
        await wait_run(pg)
        notes = [t for t in await pg.locator('#warnings li').all_text_contents() if 'hour by hour' in t]
        check('the notes say how many days were filled', bool(notes) and 'repeat its final day' in notes[0])
        # 6. a service failure falls back to the idealized day
        FAIL['forecast'] = True
        await pg.fill('#txDate', (dt.date.today() + dt.timedelta(days=1)).isoformat()); await pg.dispatch_event('#txDate', 'change'); await asyncio.sleep(0.6)
        check('a weather-service error is shown and the idealized day is used', 'idealized day below is used instead' in await pg.text_content('#wx-status'))
        FAIL['forecast'] = False
        await pg.click('#wx-ideal'); await wait_run(pg, "/^Day \\d/.test(document.getElementById('clock').textContent)")
        check('switching back to the idealized day works', True)
        # 7. typed coordinates skip the place search
        n0 = calls['nominatim']; await pg.fill('#place', '35.80, -78.70'); await pg.press('#place', 'Enter'); await asyncio.sleep(0.8)
        check('typed coordinates are used directly', '35.8000, -78.7000' in await pg.text_content('#place-status') and calls['nominatim'] == n0)
        check('no script errors', not errs, '; '.join(errs))
        await ctx.close()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.route('**/*', route)
        pg = await ctx.new_page(); await pg.goto(URL); await wait_run(pg)
        await pg.fill('#place', 'Apex, NC'); await pg.click('#place-find')
        await pg.wait_for_function("document.getElementById('wx-status').textContent.startsWith('Loaded')", timeout=20000)
        check('no sideways scrolling at phone width', await pg.evaluate('document.documentElement.scrollWidth') <= 390)
        await shot(pg.locator('#sim-form'), 'phone-form.png')
        await b.close()
    print(f'\n{PASS[0]} passed, {len(FAILS)} failed')
    sys.exit(1 if FAILS else 0)

asyncio.run(main())
