import math
import json

from django.shortcuts import render
from django.http import HttpResponse
from django.conf import settings
import requests
import svgwrite

from wirewizard.models import WizExample

def index(request):
    return render(request, 'wirewizard/index.html', {
        'DEBUG': settings.DEBUG,
    })

def info(request):
    return render(request, 'wirewizard/info.html', {
        'DEBUG': settings.DEBUG,
    })

import re
def sort_nicely( l ):
    """ Sort the given list in the way that humans expect.
    """
    convert = lambda text: int(text) if text.isdigit() else text
    alphanum_key = lambda key: [ convert(c) for c in re.split('([0-9]+)', key) ]
    l.sort( key=alphanum_key )

def split_list(a_list):
    half = int(math.ceil(len(a_list)/2.0))
    return a_list[:half], a_list[half:]

def gen_svg(component, raw_pins):
    p_pins = raw_pins['provides'].keys()
    r_pins = raw_pins['requires'].keys()
    sort_nicely(p_pins)
    sort_nicely(r_pins)
    split_pins = split_list(r_pins + p_pins)
    pin_sides = {
        'left': split_pins[0],
        'right': split_pins[1],
    }

    CONF = {
        'spacing': 15,
        'sidewidth': 100,
    }

    r_origin = (20, 2)
    r_size = (CONF['sidewidth']+20, len(pin_sides['left'])*CONF['spacing']+8)
    drawing_size = (
        r_origin[0] + r_size[0] + 22,
        r_origin[1] + r_size[1] + 3
    )
    d = svgwrite.Drawing(size = ("%dpx" % drawing_size[0], "%dpx" % drawing_size[1]))

    d.add(d.rect(insert = r_origin,
        size = ("%dpx" % r_size[0], "%dpx" % r_size[1]),
        stroke_width = "3",
        stroke = "black",
        fill = "rgb(255,255,255)",
        **{'class': component['type'] + '-color'}
        ),
        )

    for side, pins in pin_sides.iteritems():
        for i, pin in enumerate(pins):
            left = 30
            x = {'left': left, 'right': left+CONF['sidewidth']}[side]
            y = int(CONF['spacing']*0.85) + i * CONF['spacing']
            kwargs = {
                'insert': (x, y),
                'font-family': 'sans-serif',
                'font-size': '10px',
                'alignment-baseline': 'central',
            }
            if side == 'right':
                kwargs['text-anchor'] = 'end'
            d.add(d.text(pin, **kwargs))
            kwargs = {
                'stroke': "black",
                'class': "pin-lead"
            }
            if side == 'left':
                kwargs['start'] = (x-11.5, y)
                kwargs['end'] = (x-22, y)
            elif side == 'right':
                kwargs['start'] = (x+11.5, y)
                kwargs['end'] = (x+22, y)
            d.add(d.line(**kwargs))
            kwargs = {
                'center': kwargs['end'],
                'r': 2,
                'id': "pin-"+pin,
                'class': 'pin-lead'
            }
            d.add(d.circle(**kwargs))

    return d.tostring()

def get_graphic(request, identifier):
    url = settings.API_ENDPOINT + "/components/%s/" % identifier
    r = requests.get(url)
    assert r.status_code == 200
    component = r.json()['component']
    pins = r.json()['pins']
    svg_data = gen_svg(component, pins)
    return HttpResponse(svg_data, mimetype="image/svg+xml")

def examples(request):
    d = []
    for example in WizExample.objects.all():
        d.append({
            'design': example.design,
            'name': example.name,
            'default': example.default,
        })
    return HttpResponse(json.dumps(d), content_type="application/json")
