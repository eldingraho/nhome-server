"use strict";

var hue = require("node-hue-api");

var HueApi = hue.HueApi,
    lightState = hue.lightState;

var Cats = require('../services/cats.js');

var conn, devices = {}, bridges = {};

var logger;

function log()
{
    logger.info.apply(logger, arguments);
}

module.exports = function(c, l) {

    conn = c;
    logger = l.child({component: 'Hue'});

    var cfg = require('../configuration.js');
    var hue_apikey = cfg.get('hue_apikey', 'none');

    hue.nupnpSearch(function(search_err, result) {

        if (search_err) {
            log('locateBridges: ' + search_err);
            return;
        }

        if (result.length === 0) {
            return;
        }

        log('Found a bridge');

        var api = new HueApi(result[0].ipaddress, hue_apikey);

        bridges[result[0].id] = { api: api };

        api.config(function(config_err, config) {

            if (config_err) {
                log(config_err);
                return;
            }

            bridges[result[0].id].name = config.name;

            // If auth failed this property is missing
            if (!config.hasOwnProperty('ipaddress')) {

                log('Need to create user');
                conn.broadcast('pushthebutton', config.name);

                var registerInterval = setInterval(function () {
                    //log('Creating user');
                    api.createUser(result[0].ipaddress, null, 'NHome', function(createUser_err, user) {
                        if (createUser_err) {
                            //log('createUser: ' + createUser_err);
                            return;
                        }
                        clearInterval(registerInterval);
                        log('User ' + user + ' created');

                        // Connect with newly created user
                        api = new HueApi(result[0].ipaddress, user);

                        // Send username to web server
                        cfg.set('hue_apikey', user);

                        startListening();

                        loadLights(result[0].id);
                    });
                }, 5000);

            } else {
                log('Authentication ok');
                startListening();
                loadLights(result[0].id);
            }
        });
    });
};

function loadLights(id)
{
    bridges[id].api.lights(function(err, reply) {

        if (err) {
            log('api.lights: ' + err);
            return;
        }

        reply.lights.forEach(function(light) {

            var state = null;

            if (light.hasOwnProperty('state')) {

                if (!light.state.reachable) {
                    return;
                }

                var hsl = [(light.state.hue / 65534) * 359, light.state.sat / 254, light.state.bri / 254];
                var chroma = require('chroma-js')(hsl, 'hsl');

                state = {
                    on: light.state.on,
                    level: parseInt((light.state.bri / 254) * 100, 10),
                    hsl: chroma.hsl(),
                    hsv: chroma.hsv(),
                    rgb: chroma.rgb(),
                    hex: chroma.hex()
                };
            }

            devices[id + ':' + light.id] = {
                id: light.id,
                name: light.name,
                dev: bridges[id].api
            };

            if (state) {
                devices[id + ':' + light.id].state = state;
            }
        });
    });
}

function startListening()
{
    log('Ready for commands');

    conn.on('getBridges', function (command) {
        getBridges.apply(command, command.args);
    });

    conn.on('getDevices', function (command) {
        getDevices.apply(command, command.args);
    });

    conn.on('setLightState', function (command) {
        setLightState.apply(command, command.args);
    });

    conn.on('setLightColor', function (command) {
        setLightColor.apply(command, command.args);
    });

    conn.on('setLightWhite', function (command) {
        setLightWhite.apply(command, command.args);
    });

    conn.on('getLightState', function (command) {
        getLightState.apply(command, command.args);
    });

    conn.on('setDeviceName', function (command) {
        setDeviceName.apply(command, command.args);
    });

    conn.on('addNewDevices', function (command) {
        addNewDevices.apply(command, command.args);
    });

    conn.on('setDevicePowerState', function (command) {
        setDevicePowerState.apply(command, command.args);
    });
}

function getBridges(cb)
{
    var bridgeInfo = [];

    for (var bridge in bridges) {
        bridgeInfo.push({ name: bridges[bridge].name, id: bridge });
    }

    conn.broadcast('bridgeInfo', bridgeInfo);

    if (cb) cb(bridgeInfo);
}

function getDevices(cb)
{
    var all = [];

    for (var device in devices) {
        all.push({
            id: device,
            name: devices[device].name,
            state: devices[device].state,
            categories: Cats.getCats(device),
            type: 'light'
        });
    }

    if (cb) cb(all);
}

// Deprecated
function setLightState(id, values)
{
    if (!devices.hasOwnProperty(id)) {
        return;
    }

    var state = lightState.create();

    if (values.hasOwnProperty('rgb')) {
        state = state.rgb.apply(state, values.rgb);
        values.hue = state.hue;
        values.sat = state.sat;
        values.bri = state.bri;
        delete values.rgb;
    }

    var self = this;

    devices[id].dev.setLightState(devices[id].id, values, function(err, result) {

        if (err) {
            log('api.setLightState:' + err);
            return;
        }

        if (result) {

            if (values.on) {
                self.log(devices[id].name, 'light-on');
            } else {
                self.log(devices[id].name, 'light-off');
            }

            getLightState(id);
        }
    });
}

function setDevicePowerState(id, on)
{
    setLightState(id, {on: on});
}

function setLightColor(id, color_string, color_format)
{
    if (!devices.hasOwnProperty(id)) {
        return;
    }

    var state = lightState.create();

    var hsl;

    try {
        hsl = require('chroma-js')(color_string, color_format).hsl();
    } catch (e) {
        log(e);
        return;
    }

    state.hsl(hsl[0], hsl[1] * 100, hsl[2] * 100).on();

    devices[id].dev.setLightState(devices[id].id, state, function(err, result) {

        if (err) {
            log('api.setLightColor:' + err);
            return;
        }

        if (result) {
            getLightState(id);
        }
    });
}

function setLightWhite(id, brightness, temperature)
{
    if (!devices.hasOwnProperty(id)) {
        return;
    }

    temperature = ((temperature * 346) / 100) + 154;

    var state = lightState.create();

    state.hsl(0, 0, 0).white(temperature, brightness).on();

    devices[id].dev.setLightState(devices[id].id, state, function(err, result) {

        if (err) {
            log('api.setLightWhite:' + err);
            return;
        }

        if (result) {
            getLightState(id);
        }
    });
}

function getLightState(id, cb)
{
    if (!devices.hasOwnProperty(id)) {
        if (cb) cb([]);
        return;
    }

    devices[id].dev.lightStatus(devices[id].id, function(err, result) {

        if (err) {
            log('api.lightStatus: ' + err);
            if (cb) cb(null);
            return;
        }

        var hsl = [(result.state.hue / 65534) * 359, result.state.sat / 254, result.state.bri / 254];
        var chroma = require('chroma-js')(hsl, 'hsl');

        var state = {
            on: result.state.on,
            level: parseInt((result.state.bri / 254) * 100, 10),
            hsl: chroma.hsl(),
            hsv: chroma.hsv(),
            rgb: chroma.rgb(),
            hex: chroma.hex()
        };

        devices[id].state = state;

        conn.broadcast('lightState', { id: id, state: state });

        if (cb) cb(state);
    });
}

function setDeviceName(id, name)
{
    if (!devices.hasOwnProperty(id)) {
        return;
    }

    devices[id].dev.setLightName(devices[id].id, name, function(err, result) {
        if (err) {
            log('api.setDeviceName: ' + err);
            return;
        }

        if (result) {
            devices[id].name = name;
            conn.broadcast('deviceRenamed', id, name);
        }
    });
}

function addNewDevices(id)
{
    bridges[id].api.searchForNewLights(function(err, result) {

        if (err) {
            log('api.searchForNewLights: ' + err);
            return;
        }

        if (result) {
            setTimeout(function() {
                loadLights(id);
            }, 65000);
        }
    });
}
