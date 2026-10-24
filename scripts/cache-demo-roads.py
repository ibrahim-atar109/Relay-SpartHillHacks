"""Cache OSRM/OpenStreetMap road geometry for the bounded demo network.
Run manually; application playback requires no routing service. OSM attribution applies.
"""
import json, time, subprocess
from pathlib import Path
points = {'nw':[-80.160,26.137], 'n':[-80.143,26.137], 'ne':[-80.126,26.137], 'w':[-80.160,26.122], 'c':[-80.143,26.122], 'e':[-80.126,26.122], 'sw':[-80.160,26.107], 's':[-80.143,26.107], 'se':[-80.126,26.107]}
pairs = ['nw-n','n-ne','w-c','c-e','sw-s','s-se','nw-w','w-sw','n-c','c-s','ne-e','e-se']
data = {'source':'OSRM demo service / OpenStreetMap, cached October 2026; modern roads, not a reconstruction of 2005.', 'nodes':{}, 'routes':{}}
for pair in pairs:
    a,b = pair.split('-')
    for start,end in [(a,b),(b,a)]:
        coords = ';'.join(','.join(map(str,points[key])) for key in [start,end])
        url = f'https://router.project-osrm.org/route/v1/driving/{coords}?overview=full&geometries=geojson'
        route = json.loads(subprocess.check_output(['curl', '-fsSL', '--retry', '2', '--max-time', '30', url]))
        if route['code'] != 'Ok': raise RuntimeError(route)
        data['routes'][start+'-'+end] = route['routes'][0]['geometry']['coordinates']
        for key, waypoint in zip([start,end],route['waypoints']): data['nodes'][key] = waypoint['location']
        time.sleep(1)
Path('src/data/roadGeometry.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
print('Cached',len(data['routes']),'directed road paths')
