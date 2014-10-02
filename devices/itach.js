var Itach = require('simple-itach');

var conn;

var devices = {};

var remotes = {};

function log(msg)
{
    console.log('[iTach]', msg);
}

module.exports = function(c) {

    conn = c;

    conn.once('accepted', function (cfg) {
    
        log('Accepted');

        if (cfg.itach_remotes) {
            remotes = JSON.parse(cfg.itach_remotes);
        }

        var d = new Itach.discovery();

        d.on('device', function(device) {

            if (!devices.hasOwnProperty(device.UUID)) {

                log('Discovered device');

                devices[device.UUID] = {
                    name: device.Model,
                    dev: new Itach(device.host)
                };
            }
        });

        startListening();
    });
};

function startListening()
{
    log('Ready for commands');

    conn.on('getRemotes', function () {
        getRemotes();    
    });
    
    conn.on('sendRemoteCommand', function (id, cmd) {
        sendRawCommand(id, cmd);
    });

    conn.on('IRLearn', function (info) {
        setLearningMode(info.id);
    });

    conn.on('sendVolumeUp', function (remoteid) {
        sendVolumeUp(remoteid);
    });

    conn.on('sendVolumeDown', function (remoteid) {
        sendVolumeDown(remoteid);
    });

    conn.on('learnVolumeUp', function (remoteid) {
        learnVolumeUp(remoteid);
    });

    conn.on('learnVolumeDown', function (remoteid) {
        learnVolumeDown(remoteid);
    });

    conn.on('sendKey', function (remoteid, key) {
        sendVolumeUp(remoteid, key);
    });

    conn.on('learnKey', function (remoteid, key) {
        learnKey(remoteid, key);
    });

    conn.on('saveCustomRemote', function (remote) {
        saveCustomRemote(remote);
    });

    conn.on('deleteCustomRemote', function (remoteid) {
        deleteCustomRemote(remoteid);
    });

    conn.on('getCustomRemotes', function () {
        getCustomRemotes();
    });
}

function getRemotes()
{
    var remotes = [];

    for (device in devices) {
        remotes.push({id: device, name: devices[device].name});
    }

    conn.emit('remotes', remotes);
}

function sendRawCommand(id, cmd)
{
    if (!devices.hasOwnProperty(id)) {
        return;
    }

    devices[id].dev.send(cmd, function (err, res) {
        if (err) {
            log(err);
            return;
          }
    });
}

function sendVolumeUp(remoteid)
{
    sendKey(remoteid, 'VOLUME UP');
}

function sendVolumeDown(remoteid)
{
    sendKey(remoteid, 'VOLUME DOWN');
}

function learnVolumeUp(remoteid)
{
    learnKey(remoteid, 'VOLUME UP');
}

function learnVolumeDown(remoteid)
{
    learnKey(remoteid, 'VOLUME DOWN');
}

function sendKey(remoteid, key)
{
    var remote = remotes[remoteid];

    cmd = remote.keys[key].replace('1:1', remote.connector);

    sendRawCommand(remote.deviceid, cmd + '\r');
}

function learnKey(remoteid, key)
{
    var id = remotes[remoteid].deviceid;

    devices[id].dev.learn(function (err, res) {

        if (err) {
            log('Learn error: ' + err);
            return;
        }

        saveCode(remoteid, key, res);
    
        conn.emit('IRKeyLearned', { remoteid: remoteid, key: key });
    });
}

function saveCode(remoteid, key, code)
{
    remotes[remoteid].keys[key] = code;

    saveRemotes();
}

function saveRemotes()
{
    conn.emit('setConfig', { itach_remotes: JSON.stringify(remotes) });
}

function saveCustomRemote(r)
{
    r.keys = {};
    r.id = require('node-uuid').v4();

    remotes[r.id] = r;

    saveRemotes();

    conn.emit('customRemoteAdded', r);
}

function deleteCustomRemote(id)
{
    delete remotes[id];

    saveRemotes();

    conn.emit('customRemoteDeleted', id);
}

function getCustomRemotes()
{
    var customremotes = [], r;

    for (r in remotes) {

        var r2 = JSON.parse(JSON.stringify(remotes[r]));

        r2.keys = Object.keys(r2);

        customremotes.push(r2);
    }

    conn.emit('customRemotes', customremotes);
}
