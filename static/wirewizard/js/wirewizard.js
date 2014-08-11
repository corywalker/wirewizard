Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context);
});

var grid_link_tpl = Handlebars.compile($("#grid-link").html());
var inspector_tpl = Handlebars.compile($("#inspector").html());
var solve_fail_tpl = Handlebars.compile($("#solve_fail").html());
var stroke_tpl_s = "M {{x1}}, {{y1}} C {{x1b}}, {{y1}}, {{x2b}}, {{y2}}, {{x2}}, {{y2}}";
var stroke_tpl = Handlebars.compile(stroke_tpl_s);
var pstyle = 'background-color: #F5F6F7; border: 1px solid #dfdfdf; padding: 2px;';
var pstyleb = 'border: 0px; padding: 0px;';
components = [];
f = null;
var mode = 'link-mode';

placed = [];
links = [];
wires = [];
var currid = 1;
var solvedone = false;

selected = null
var valid_networks = []
var invalid_networks = []
var examples = [];
var dragging = null;
var oldzoom = null;
var vp_elements, visuallinks, visualwires, svg, x, y, zoom;

function getState() {
    var filteredlinks = [];
    _.each(links, function(l) {
        filteredlinks.push(_.omit(l, ['ad', 'bd']));
    })
    var filteredplaced = [];
    _.each(placed, function(p) {
        var component_model = p.component.model;
        var toadd = _.omit(p, ['component', 'pins']);
        toadd.component_model = component_model;
        filteredplaced.push(toadd);
    })
    var d = {
        placed: filteredplaced,
        links: filteredlinks,
        wires: wires,
        currid: currid,
        solvedone: solvedone,
    }
    return d;
}

function exportState() {
    var d = getState();
    var json = JSON.stringify(d, undefined, 2);
    console.log(json);
}

function loadState(d) {
    placed = [];
    _.each(d.placed, function(p) {
        var toadd = jQuery.extend({},p);
        delete toadd.component_model;
        toadd.component = _.findWhere(components, {model: p.component_model});
        placed.push(toadd);
    });
    links = d.links;
    wires = d.wires;
    currid = d.currid;
    solvedone = d.solvedone;
    refreshGraph();
}

var config = {
    layout: {
        name: 'layout',
        panels: [
            //{ type: 'top', size: 32, resizable: false, style: pstyle, content: 'WireWizard' },
            { type: 'left', size: 200, style: pstyle,
                toolbar: {
                    items: [
                        { type: 'html',  id: 'item1',
                            html: '<div style="padding: 2px 0px 1px;">'+
                                  '    <input id="c-search" type="text" style="padding: 3px; border-radius: 2px; border: 1px solid silver; width: 192px" placeholder="Search components"/>'+
                                  '</div>'
                        },
                    ],
                }
            },
            { type: 'preview', content: '<pre id="console" style="overflow-y: scroll; height:98%;"></pre>',
                size: '200px', resizable: true, hidden: true, style: pstyle,
                tabs: {
                    active: 'tab1',
                    tabs: [
                        { id: 'tab1', caption: 'Console' },
                    ],
                    onClick: function (event) {
                        w2ui['layout'].sizeTo('preview', "200px");
                    },
                    onResize: function (event) {
                        render();
                    }
                }
            },
            { type: 'main', name: "workspace", content: '<div class="chart-container" style="height:99%"></div>', style: pstyle, toolbar: {
                name: "main_toolbar",
                items: [
                    { type: 'radio',  id: 'move-mode',  group: '1', caption: 'Move', icon: 'fa fa-hand-o-up'},
                    { type: 'radio',  id: 'link-mode',  group: '1', caption: 'Link', icon: 'fa fa-exchange'},
                    { type: 'spacer', id: 'spacer1' },

                    { type: 'menu',   id: 'examples-menu', caption: 'Examples', icon: 'fa fa-folder-open', items: []},
                    { type: 'break', id: 'break1' },
                    { type: 'button',  id: 'back-btn', caption: 'Back', icon: 'fa fa-undo' },
                    { type: 'button',  id: 'clear-btn', caption: 'Clear', icon: 'fa fa-times clear' },
                    { type: 'button',  id: 'connect-btn', caption: 'Connect using EDAsolver', icon: 'fa fa-check connect' },
                ],
            } }
        ]
    },
    toolbars: {
        toolbar_before: ['move-mode', 'link-mode', 'spacer1', 'examples-menu', 'break1', 'clear-btn', 'connect-btn'],
        toolbar_after: ['move-mode', 'spacer1', 'back-btn']
    },
    layout2: {
        name: 'layout2',
        panels: [
            { type: 'preview', size: 200, style: pstyleb },
            { type: 'main', style: pstyleb }
        ]
    },
    grid: {
        name: 'grid',
        columns: [
            { field: 'name', caption: 'Component Name', size: '90%' },
            { field: 'ww-link', caption: 'Link', size: '10%' },
        ],
        onSelect: function(event) {
            event.onComplete = function () {
                selectFromGrid();
            }
        },
        onUnselect: function(event) {
            event.onComplete = function () {
                selectFromGrid();
            }
        }
    },
}

function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function updateInspector() {
    w2ui.layout2.content('preview', inspector_tpl({selected: selected}));
}

function selectComponent(c) {
    selected = c;
    updateInspector();
    refreshGraph();
}

function selectFromGrid() {
    selection = w2ui.grid.getSelection(true);
    if (selection.length) {
        c = w2ui.grid.records[selection[0]];
        selectComponent(c);
    } else {
        selectComponent(null);
    }
}

function clearHover() {
    // Delete any hover elements that might be present
    var todelete = -1;
    while (todelete != null) {
        if (todelete != -1 && todelete != null)
            placed.splice(todelete, 1)
        todelete = null;
        for(var i=0; i< placed.length; i++){
            if (placed[i]['type'] == 'hover')
                todelete = i;
        }
    }
}
function clearTempLink() {
    // Delete any temporary link elements that might be present
    var todelete = -1;
    while (todelete != null) {
        if (todelete != -1 && todelete != null)
            links.splice(todelete, 1)
        todelete = null;
        for(var i=0; i< links.length; i++){
            if (links[i]['type'] == 'temporary')
                todelete = i;
        }
    }
}

var pin_cache = {};
function getPins(c_id) {
    if (c_id in pin_cache) {
        return pin_cache[c_id];
    } else {
        pin_cache[c_id] = {};
        $.getJSON( "/api/components/"+c_id+'/pins/', function( pins ) {
            pin_cache[c_id] = pins;
            return pin_cache[c_id];
        });
    }
    return {};
}

var graphic_cache = {};
function getGraphic(c_id) {
    if (c_id in graphic_cache) {
        return graphic_cache[c_id];
    } else {
        graphic_cache[c_id] = null;
        d3.xml("/wirewizard/graphic/"+c_id+"/",
        "image/svg+xml",
        function(xml) {
            graphic_cache[c_id] = document.importNode(xml.documentElement, true);
            refreshGraph();
            return graphic_cache[c_id];
        });
    }
    return null;
}

function updateGrid(str) {
    if (str.length) {
        // If there is a search term, display results
        var result = f.search(str);
    } else {
        // If no search term, display most popular components
        var result = components;
        result.sort(function(a, b) {
            return b.popularity - a.popularity;
        })
    }
    // Append useful information to results
    $.each(result, function( index, value ) {
        result[index]['recid'] = index + 1;
        result[index]['ww-link'] = grid_link_tpl(result[index])
    });

    w2ui.grid.clear();
    w2ui.grid.records = result;
    w2ui.grid.total = result.length;
    w2ui.grid.selectNone();
    w2ui.grid.select(1);
    w2ui.grid.refresh();
}

var refreshGraph = function() {
    if (selected == null) {
        clearHover();
    }

    $("#vp-elements").remove();
    svg.append("g").attr("id", "vp-elements")
    $("#visuallinks").remove();
    svg.append("g").attr("id", "visuallinks")
    $("#visualwires").remove();
    svg.append("g").attr("id", "visualwires")

    vp_elements = svg.select("#vp-elements").selectAll(".component").data(placed);
    vp_elements.enter().append("g").classed("component", true)
    vp_elements.each(function(d, i) {
        $(this).find("svg").remove();
        $(this).find("text").remove();
        if (getGraphic(d.component._id) != null) {
            var plane = this.appendChild(getGraphic(d.component._id).cloneNode(true));
            d.svg_id = "component-"+d.id.toString();
            $(this).find("svg").attr("id", d.svg_id);
            var mysvg = $("#"+d.svg_id)
            d.dims = {}
            d.dims.w = mysvg.attr('width')
            d.dims.w = d.dims.w.slice(0, d.dims.w.length-2);
            d.dims.w = parseFloat(d.dims.w);
            d.dims.h = mysvg.attr('height')
            d.dims.h = d.dims.h.slice(0, d.dims.h.length-2);
            d.dims.h = parseFloat(d.dims.h);
        } else {
            d.dims = {w: 0, h: 0};
        }
        d.dims.x1 = d.x - d.dims.w/2.0;
        d.dims.x2 = d.x + d.dims.w/2.0;
        d.dims.y1 = d.y - d.dims.h/2.0;
        d.dims.y2 = d.y + d.dims.h/2.0;
    }).classed("componenthoveredplace", function(d){return d.hovering && mode=="move-mode";})
    .classed("componenthoveredlink", function(d){return d.hovering && mode=="link-mode";})
    .attr("id", function(d) {
        return "component-g-"+d.id.toString();
    }).attr("opacity", function(d) {
        return d.type == "hover" ? 0.5 : 1.0;
    }).append("text")
    .attr("x", 30)
    .attr("y", function(d) {
        return 10 + (d.dims.h || 0);
    }).text(function(d) {
        return d.component.model;
    });
    vp_elements.append("text")
    .attr("x", 30)
    .attr("y", -7).text(function(d) {
        return d.id.toString();
    });
    vp_elements.attr("transform", transform);
    vp_elements.exit().remove();

    if (!solvedone) {
        visuallinks = svg.select("#visuallinks").selectAll(".visuallink").data(links);
        visuallinks.enter().append("line").classed("visuallink", true);

        visuallinks
        .each(function(d) {
            d.ad = d3.select("#component-g-"+d.tail.id.toString()).data()[0];
            if (_.has(d.head, "id")) {
                d.bd = d3.select("#component-g-"+d.head.id.toString()).data()[0];
                d.headpos = {x:d.bd.x, y:d.bd.y};
            } else {
                d.headpos = {x:d.head.x, y:d.head.y};
            }
        })
        .attr("x1", function(d) {return 0;})
        .attr("y1", function(d) {return 0;})
        .attr("x2", function(d) {
            end = d.headpos.x;
            return end - d.ad.x;
        })
        .attr("y2", function(d) {
            end = d.headpos.y;
            return d.ad.y - end;
        })
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .attr("opacity", 0.3)
        .attr("marker-end", "url(#arrowhead)")
        .attr("transform", linktransform);

        visuallinks.exit().remove();
    }

    visualwires = svg.select("#visualwires").selectAll(".visualwire").data(wires);
    visualwires.enter().append("path").classed("visualwire", true);

    visualwires
    .each(function(d) {
        d.ad = d3.select("#component-g-"+d.a.id.toString()).data()[0];
        d.bd = d3.select("#component-g-"+d.b.id.toString()).data()[0];
        asvg = $("#"+d.ad.svg_id).first();
        bsvg = $("#"+d.bd.svg_id).first();
        apin = asvg.find("#pin-"+d.a.pin).first();
        bpin = bsvg.find("#pin-"+d.b.pin).first();
        d.apinloc = {x:parseFloat(apin.attr("cx")),y:parseFloat(apin.attr("cy"))};
        d.bpinloc = {x:parseFloat(bpin.attr("cx")),y:parseFloat(bpin.attr("cy"))};
        d.x1 = d.apinloc.x - d.ad.dims.w/2.0;
        d.y1 = d.apinloc.y - d.ad.dims.h/2.0;
        if (d.apinloc.x < 30)
            d.x1b = d.x1 - 100;
        else
            d.x1b = d.x1 + 100;
        start = d.ad.x;
        end = d.bd.x + d.bpinloc.x - d.bd.dims.w/2.0;
        d.x2 = end - start;
        end = d.bd.y - d.bpinloc.y + d.bd.dims.h/2.0;
        d.y2 = d.ad.y - end;
        if (d.bpinloc.x < 30)
            d.x2b = d.x2 - 100;
        else
            d.x2b = d.x2 + 100;
    })
    .attr("d", function(d) {
        //tpl = "M {{x1}} {{y1}} L {{x2}} {{y2}}";
        return stroke_tpl(d);
    })
    .attr("stroke", function(d) {return d.color;})
    .attr("fill", "none")
    .attr("transform", linktransform);

    visualwires.exit().remove();

    $('.pin-lead').toggle(solvedone);
}

function transform(d) {

    var xloc = x(d.x - d.dims.w/2.0);
    var yloc = y(d.y + d.dims.h/2.0);
    return "translate(" + xloc + "," + yloc + "),scale("+zoom.scale()+")";
}

function linktransform(d) {
    var xloc = x(d.ad.x);
    var yloc = y(d.ad.y);
    return "translate(" + xloc + "," + yloc + "),scale("+zoom.scale()+")";
}

Array.range= function(a, b, step){
    var A= [];
    if(typeof a== 'number'){
        A[0]= a;
        step= step || 1;
        while(a+step<= b){
            A[A.length]= a+= step;
        }
    }
    else{
        var s= 'abcdefghijklmnopqrstuvwxyz';
        if(a=== a.toUpperCase()){
            b=b.toUpperCase();
            s= s.toUpperCase();
        }
        s= s.substring(s.indexOf(a), s.indexOf(b)+ 1);
        A= s.split('');
    }
    return A;
}

function addToSet(set, element) {
    var found = false;
    for(var i = 0; i < set.length; i++) {
        if (_.isEqual(element, set[i])) {
            found = true;
            break;
        }
        element.reverse();
        if (_.isEqual(element, set[i])) {
            found = true;
            break;
        }
        element.reverse();
    }
    if (!found) {
        set.push(element);
    }
}

function render() {
    $('.chart-container').empty();
    var showAxis = false;
    var $container = $('.chart-container'),
        cwidth = $container.width(),
        cheight = $container.height();

    if (showAxis) {
        var margin = {top: 0, right: 0, bottom: 10, left: 20},
            width = cwidth - margin.left - margin.right,
            height = cheight - margin.top - margin.bottom;
    } else {
        var margin = {top: 0, right: 0, bottom: 0, left: 0},
            width = cwidth - margin.left - margin.right,
            height = cheight - margin.top - margin.bottom;
    }

    x = d3.scale.linear()
        .domain([-width / 2, width / 2])
        .range([0, width]);

    y = d3.scale.linear()
        .domain([-height / 2, height / 2])
        .range([height, 0]);

    var xAxis = d3.svg.axis()
        .scale(x)
        .tickValues(Array.range(-10000, 10000, 100))
        .orient("bottom")
        .tickSize(-height);

    var yAxis = d3.svg.axis()
        .scale(y)
        .tickValues(Array.range(-10000, 10000, 100))
        .orient("left")
        .tickSize(-width);

    zoom = d3.behavior.zoom()
        .x(x)
        .y(y)
        .scaleExtent([0.25, 4])
        .on("zoom", zoomed);

    svg = d3.select(".chart-container").append("svg")
        .classed("viewport", true)
        .attr("width", '100%')
        .attr("height", '100%')
      .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
        .call(zoom);

    svg.append("defs").append("marker")
        .attr("id", "arrowhead")
        .attr("refX", 4) /*must be smarter way to calculate shift*/
        .attr("refY", 2)
        .attr("markerWidth", 6)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
            .attr("d", "M 0,0 V 4 L6,2 Z"); //this is actual shape for arrowhead

    svg.append("rect")
        .classed("grid-bg", true)
        .attr("width", width)
        .attr("height", height);

    svg.append("g")
        .attr("class", "x axis")
        .attr("transform", "translate(0," + height + ")")
        .call(xAxis);

    var gy = svg.append("g")
        .attr("class", "y axis")
        .call(yAxis);

    refreshGraph();

    function zoomed() {
        // Update vp_elements location and axes
        vp_elements.attr("transform", transform);
        visuallinks.attr("transform", linktransform);
        visualwires.attr("transform", linktransform);
        svg.select(".x.axis").call(xAxis);
        svg.select(".y.axis").call(yAxis);
    }

    svg.on("mousemove", function() {
        var m = d3.mouse(this);
        var mappedm = {x: x.invert(m[0]), y: y.invert(m[1])};
        clearHover();
        if (selected != null && !solvedone) {
            d = {x: mappedm.x, y: mappedm.y, type: 'hover', component: selected, id: currid, pins: getPins(selected._id)};
            placed.push(d);
        }
        if (dragging != null && mode == "move-mode") {
            _.each(placed, function(d) {
                if (d.id == dragging) {
                    d.x = mappedm.x;
                    d.y = mappedm.y;
                }
            });
        }
        clearTempLink();
        if (dragging != null && mode == "link-mode") {
            d = {tail: {id:dragging}, type: 'temporary', head: {x:mappedm.x, y:mappedm.y}};
            _.each(placed, function(c) {
                if (c.hovering && c.id != dragging) {
                    d.head = {id: c.id};
                }
            })
            links.push(d);
        }
        var foundHovered = false;
        d3.selectAll('.component').each(function(d) {
            var hovered = ( mappedm.x > d.dims.x1 && mappedm.x < d.dims.x2 && mappedm.y > d.dims.y1 && mappedm.y < d.dims.y2)
            if (hovered && !foundHovered) {
                foundHovered = true;
                d.hovering = true;
            } else {
                d.hovering = false;
            }
        });
        refreshGraph();
    });
    svg.on("mousedown", function() {
        _.each(placed, function(d) {
            if (d.hovering) {
                dragging = d.id;
                disablePan();
            }
        });
        refreshGraph();
    });
    svg.on("mouseup", function() {
        clearTempLink();
        if (dragging != null) {
            _.each(placed, function(c) {
                if (c.hovering && c.id != dragging) {
                    d = {tail: {id:dragging}, type: 'permanent', head: {id: c.id}};
                    links.push(d);
                }
            });
            dragging = null;
            enablePan();
        }
        for(var i=0; i< placed.length; i++){
            if (placed[i]['type'] == 'hover') {
                placed[i]['type'] = 'placed';
                //addToSet(links, [{id: 1}, {id: 2}]);
                currid = currid + 1;
                w2ui.grid.selectNone();
                selectFromGrid();
            }
        }
        refreshGraph();
    });
    svg.on("mouseleave", function() {
        clearHover();
        refreshGraph();
    });
    disablePan();
    enablePan();
};

function buildDesign() {
    d = {
        "type": "graph",
        "power_supplies": [{
            "voltage": 7.2,
            "current": 15
        }],
        "components": [],
        "links": []
    }
    _.each(placed, function (c) {
        newc = {"id": c.id, "model": c.component.model}
        d["components"].push(newc);
    });
    _.each(links, function (l) {
        newl = {"tail": l.tail.id, "head": l.head.id}
        d["links"].push(newl);
    });
    return d;
}

function disablePan() {
    svg.call(zoom)
        .on('mousedown.zoom', null)
        .on('touchstart.zoom', null)
        .on('dblclick.zoom', null);
}

function enablePan() {
    svg.call(zoom);
}

function setSolveStatus(status) {
    solvedone = status;
    if (status) {
        setToolbar('toolbar_after');
        if (valid_networks.length) {
            loadNetwork(valid_networks[0]);
            w2ui['layout'].sizeTo('preview', "30px");
        } else {
            if (invalid_networks.length) {
                w2alert(solve_fail_tpl({uns_list: invalid_networks[0].unsatisfied_list}), "Solve error");
            } else {
                w2alert("Solving failed for an unknown reason.\n\nPlease check console output and retry.", "Solve error")
            }

        }
    } else {
        wires = [];
        valid_networks = [];
        invalid_networks = [];
        setToolbar('toolbar_before');
        w2ui['layout'].hide('preview', true);
    }
}

function loadNetwork(network) {
    var n = 1;
    var color = d3.scale.category10();
    _.each(network.cons, function(con) {
        _.each(con.consumers, function(consumer) {
            newwire = {
                a: {id:con.provider.external_id,pin:con.provider.pin},
                b: {id:consumer.external_id,pin:consumer.pin},
                color: color(n)
            };
            //addToSet(wires, newwire);
            wires.push(newwire);
        });
        n += 1;
    });
    refreshGraph();
}

function solve() {
    design = buildDesign();
    json = JSON.stringify(design);
    w2ui['layout'].sizeTo('preview', "200px");
    w2ui['layout'].show('preview', true);
    $('#console').text('');
    var done = false;
    $.post("/api/solvers/", {'design': json})
        .done(function( data ) {
        //alert( "Data Loaded: " + data );
        function refresh(){
            interv = setTimeout(function() {
                $.get( "/api/solvers/" + data['solver_id'] + "/read/", function( data ) {
                    var cons = $("#console");
                    var updatedconsole = false;
                    for (i = 0; i < data.messages.length; i++) {
                        if (data.messages[i].type == 'message') {
                            cons.text( cons.text() + data.messages[i].message + "\n");
                            updatedconsole = true;
                        } else if (data.messages[i].type == 'component_network') {
                            if (data.messages[i].valid)
                                valid_networks.push(data.messages[i]);
                            else
                                invalid_networks.push(data.messages[i]);
                        } else if (data.messages[i].type == 'done') {
                            done = true;
                            setSolveStatus(true);
                            //w2ui['layout'].hide('preview', window.instant);
                        }
                    }
                    if (data.stderr.length) {
                        cons.text( cons.text() + data.stderr );
                        updatedconsole = true;
                        done = true;
                        setSolveStatus(true);
                    }
                    if (updatedconsole) {
                        cons.stop();
                        cons.animate({"scrollTop": cons[0].scrollHeight}, "slow");
                    }
                    if (!done)
                        refresh();
                });
            }, 400);
        }
        //Call the function
        refresh();

        //window.open("/solve/"+data['design_id']+"/");
    });
}


function setToolbar(tname) {
    _.each(_.values(config.toolbars), function(tdef) {
        _.each(tdef, function(id) {
            w2ui.layout_main_toolbar.hide(id);
        });
    });
    _.each(config.toolbars[tname], function(id) {
        w2ui.layout_main_toolbar.show(id);
    });
    if (tname == 'toolbar_before') {
        w2ui.layout_main_toolbar.set('move-mode', { checked: false });
        w2ui.layout_main_toolbar.set('link-mode', { checked: true });
        mode = 'link-mode';
    } else if (tname == 'toolbar_after') {
        w2ui.layout_main_toolbar.set('link-mode', { checked: false });
        w2ui.layout_main_toolbar.set('move-mode', { checked: true });
        mode = 'move-mode';
    }
}

function loadExample(name) {
    design = _.findWhere(examples, {name:name}).design
    d = jQuery.parseJSON(design)
    loadState(d);
}

$(function () {
    // Setup UI
    $('#layout').w2layout(config.layout);
    w2ui.layout.content('left', $().w2layout(config.layout2));
    w2ui.layout2.content('main', $().w2grid(config.grid));
    setToolbar('toolbar_before');
    updateInspector();
    w2ui.grid.show.columnHeaders = false;

guiders.createGuider({
  buttons: [{name: "Next"}],
  description: "WireWizard is the autorouter for schematics. This demo will explain to you the basics.",
  id: "first",
  next: "second",
  overlay: true,
  title: "Welcome to WireWizard!"
}).show();
guiders.createGuider({
  attachTo: "#c-search",
  buttons: [{name: "Next"}],
  description: "This textbox allows you to search for components to add to the viewport. Simply click on the component you wish to add and then click again on the viewport to place it.",
  id: "second",
  next: "third",
  position: 7,
  title: "Adding components",
  offset: {left: 30, top: 15},
});
guiders.createGuider({
  attachTo: ".inspector-title",
  buttons: [{name: "Next"}],
  description: "The inspector view shows details about components when you select them in the search grid.",
  id: "third",
  next: "fourth",
  position: 3,
  title: "Component details",
  offset: {left: 0, top: 15},
});
guiders.createGuider({
  attachTo: "#tb_layout_main_toolbar_item_move-mode",
  buttons: [{name: "Next"}],
  description: "The move tool allows you to move components around. This makes no functional difference but can imporove aesthetics.",
  id: "fourth",
  next: "fifth",
  position: 7,
  title: "Move tool",
  offset: {left: -10, top: 15},
});
guiders.createGuider({
  attachTo: "#tb_layout_main_toolbar_item_link-mode",
  buttons: [{name: "Next"}],
  description: "The link tool is very important. Once components have been placed, tell WireWizard that you want the components to work together. The arrow direction matters. The direction indicates that resources from a device will be offered to the component that the arrow points to. See the examples if this does not make sense.",
  id: "fifth",
  next: "sixth",
  position: 7,
  title: "Link tool",
  offset: {left: -10, top: 15},
});
guiders.createGuider({
  attachTo: "#tb_layout_main_toolbar_item_clear-btn",
  buttons: [{name: "Next"}],
  description: "Use this button to clear out the current design and start over.",
  id: "sixth",
  next: "seventh",
  position: 5,
  title: "Clear button",
  offset: {left: 10, top: 15},
});
guiders.createGuider({
  attachTo: "#tb_layout_main_toolbar_item_connect-btn",
  buttons: [{name: "Next"}],
  description: "This button will attempt to connect pins for each link that you have defined.",
  id: "seventh",
  next: "eighth",
  position: 5,
  title: "Connect button",
  offset: {left: -50, top: 15},
});
guiders.createGuider({
  attachTo: ".inspector-title",
  buttons: [{name: "Done!", onclick: guiders.hideAll}],
  description: "The console (normally hidden) will show briefly but stay if there have been any errors in the solve. Advanced users will find this area useful.",
  id: "eighth",
  next: "ninth",
  position: 11,
  title: "Console",
  offset: {left: 300, top: 200},
});

    w2ui.layout_main_toolbar.on('*', function (event) {
        if (event.type == 'click' && event.target.lastIndexOf('examples-menu:', 0) == 0) {
            loadExample(event.subItem.id);
        }
        if (event.type == 'click' && endsWith(event.target, "-mode")) {
            mode = event.target;
        } else if (event.type == 'click' && event.target == "clear-btn") {
            placed = [];
            links = [];
            wires = [];
            currid = 1;
            refreshGraph();
        } else if (event.type == 'click' && event.target == "back-btn") {
            setSolveStatus(false);
            refreshGraph();
        } else if (event.type == 'click' && event.target == "connect-btn") {
            unlinked = false;
            _.each(placed, function(c) {
                if (c.type == "placed") {
                    thisconnected = false;
                    _.each(links, function(l) {
                        if (l.type == "permanent")
                            if (l.head.id == c.id || l.tail.id == c.id)
                                thisconnected = true;
                    });
                    if (!thisconnected)
                        unlinked = true;
                }
            });
            cont = true;
            if (unlinked) {
                var msg = "There are unlinked components in this design. This means that WireWizard will not attempt to connect the components. Do you still wish to continue?"
                w2confirm(msg, function (btn) { if (btn == "Yes") {solve();} });
            } else {
                solve();
            }
        }
    });

    // Fetch component list
    $.getJSON( "/api/components/", function( json ) {
        components = json;
        components = _.filter(components, function(c) {return c.model != "generic_battery";});
        var options = {
          keys: ['name', 'model', 'class', 'type'],
        }
        f = new Fuse(components, options);
        updateGrid("");
        w2ui.grid.selectNone();
        selectFromGrid();

        $.getJSON( '/wirewizard/examples/', function( d ) {
            examples = d;
            var newitems = [];
            var toload = null;
            _.each(examples, function(example) {
                newitems.push({
                    text: example.name,
                });
                if (example.default) {
                    toload = example.name;
                }
            });
            w2ui.layout_main_toolbar.set('examples-menu', {items:newitems});
            if (toload) {
                loadExample(toload);
            }
        });
     });

    $( "#c-search" ).keyup(function () {
        var str = $("#c-search").val();
        updateGrid(str);
    });
    $("#c-search").focus(function() { $(this).select(); } );

    // Do initial viewport render
    render();
});

// Be sure to resize viewport on browser window resize
d3.select(window).on('resize', render);

// Shortcut key for search
$(document).keydown(function(e) {
    if (e.keyCode == 70 && (e.ctrlKey || e.metaKey)) {
        $("#c-search").focus();
    }
});
