"use strict";

var Namer = require('../services/namer.js');
var cfg = require('../configuration.js');

var conn;

var lights = {}, bridges = {};

var logger;

function log()
{
    logger.info.apply(logger, arguments);
}

module.exports = function(c, l) {

    conn = c;
    logger = l.child({component: 'Insteon'});

    var html = '';

    require('http').get("http://connect.insteon.com/getinfo.asp", function(res) {

        res.on('data', function(d) {
            html += d.toString();
        });

        res.on('end', function() {

            var regex = /<a href="http:..([0-9.]+):25105">/;

            var matches = regex.exec(html);

            if (!matches) {
                return;
            }

            var host = matches[1];

            log('Hub found');

            var Insteon = require('home-controller').Insteon;

            var insteon = new Insteon();

            bridges['insteon:' + host] = insteon;

            startListening();

            var blacklist = cfg.get('blacklist_bridges', []);

            if (blacklist.indexOf('insteon:' + host) !== -1) {
                return;
            }

            insteon.on('error', function(err) {
                log(err);
            });

            insteon.connect(host, function() {

                log('Connected');

                insteon.links(function(error, info) {

                    info.forEach(function(device) {
                        insteon.info(device.id, function(device_error, device_info) {
                            if (device_info.isLighting) {
                                lights[device.id] = insteon.light(device.id);
                            }
                        });
                    });

                    Namer.add(lights);
                });
            });
        });

    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });

};

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

    conn.on('getLightState', function (command) {
        getLightState.apply(command, command.args);
    });

    conn.on('getDevicePowerState', function (command) {
        getDevicePowerState.apply(command, command.args);
    });

    conn.on('setDevicePowerState', function (command) {
        setDevicePowerState.apply(command, command.args);
    });

    conn.on('toggleDevicePowerState', function (command) {
        toggleDevicePowerState.apply(command, command.args);
    });
}

function getBridges(cb)
{
    var blacklist = cfg.get('blacklist_bridges', []);

    var bridgeInfo = [];

    for (var bridge in bridges) {
        bridgeInfo.push({
            name: 'Insteon',
            module: 'insteon',
            id: bridge,
            ip: null,
            mac: null,
            blacklisted: blacklist.indexOf(bridge) !== -1
         });
    }

    conn.broadcast('bridgeInfo', bridgeInfo);

    if (cb) cb(bridgeInfo);
}

function getDevices(cb)
{
    var all = [];

    for (var device in lights) {
        all.push({
            id: device,
            name: Namer.getName(device),
            type: 'light',
            module: 'insteon'
        });
    }

    require('../common.js').addDeviceProperties(all);

    if (cb) cb(all);
}

// deprecated
function setLightState(id, values, cb)
{
    if (!lights.hasOwnProperty(id)) {
        if (cb) cb();
        return;
    }

    var light = lights[id];
    var self = this;

    if (values.hasOwnProperty('on')) {

        if (values.on) {
            light.turnOnFast(function(err) {
                if (err) {
                    log('light.turnOnFast: ' + err);
                    if (cb) cb(false);
                    return;
                }

                self.log(Namer.getName(id), 'light-on');

                getLightState(id);

                if (cb) cb(true);
            });
        } else {
            light.turnOffFast(function(err) {
                if (err) {
                    log('light.turnOffFast: ' + err);
                    if (cb) cb(false);
                    return;
                }

                self.log(Namer.getName(id), 'light-off');

                getLightState(id);

                if (cb) cb(true);
            });
        }
    }

    if (values.hasOwnProperty('bri')) {

        light.level(parseInt(values.bri, 10), function(err) {
            if (err) {
                log('light.level: ' + err);
                if (cb) cb(false);
                return;
            }

            getLightState(id);

            if (cb) cb(true);
        });
    }
}

function setDevicePowerState(id, on, cb)
{
    if (!lights.hasOwnProperty(id)) {
        if (cb) cb();
        return;
    }

    setLightState.call(this, id, {on: on}, cb);
}

function getDevicePowerState(id, cb)
{
    if (!lights.hasOwnProperty(id)) {
        if (cb) cb();
        return;
    }

    getLightState(id, function (state) {
        if (cb) cb(state.on);
    });
}

function toggleDevicePowerState(id, cb)
{
    if (!lights.hasOwnProperty(id)) {
        if (cb) cb();
        return;
    }

    var self = this;

    getDevicePowerState(id, function (state) {
        setDevicePowerState.call(self, id, !state, cb);
    });
}

function getLightState(id, cb)
{
    if (!lights.hasOwnProperty(id)) {
        if (cb) cb();
        return;
    }

    var light = lights[id];

    light.level(function(err, level) {

        if (err) {
            logger.error(err);
            if (cb) cb(false);
            return;
        }

        var on = level > 0;
        var lightState = { on: on, level: level };
        conn.broadcast('lightState', { id: id, state: lightState});
        if (cb) cb(lightState);
    });
}
