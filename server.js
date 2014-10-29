var io = require('socket.io-client');

var serverUrl = 'https://nhome.neosoft.ba:8080';
var conn = io.connect(serverUrl);

conn.on('connect', function () {

    console.log('Connected to socket.io');

    conn.emit('serverhello', { uuid: getUUID() });
});

conn.on('disconnect', function () {
    console.log('disconnected');
});

conn.emitLocal = function (name) {

    var args = Array.prototype.slice.call(arguments, 1);

    var packet = {
        type: 'event',
        name: name,
        args: args
    };

    this.onPacket(packet);
}

function getUUID()
{
    var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;

    var uuidFile = require('path').join(home, 'nhome-uuid');

    var fs = require('fs');

    if (!fs.existsSync(uuidFile)) {
        console.log('Generating new uuid');
        var uuid = require('node-uuid').v4();
        fs.writeFileSync(uuidFile, uuid);
    }

    return fs.readFileSync(uuidFile, { encoding: 'utf8'});
}

require('./devices/hue.js')(conn);
require('./devices/wemo.js')(conn);
//require('./devices/upnp.js')(conn);
require('./devices/lg.js')(conn);
require('./devices/insteon.js')(conn);
require('./devices/itach.js')(conn);
//require('./devices/samsung-remote.js')(conn);
require('./devices/fibaro.js')(conn);
require('./devices/razberry.js')(conn);
require('./devices/lifx.js')(conn);

require('./services/schedule.js')(conn);
require('./services/proxy.js')(conn);

process.on('uncaughtException', function (err) {
	console.log('uncaughtException:' + err);
	console.log(err.stack);
});
