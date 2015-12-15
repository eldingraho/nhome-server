"use strict";

var MjpegConsumer = require('mjpeg-consumer');
var Limiter = require('write-limiter');
var http = require('http');
var https = require('https');
var url = require('url');

var streamingMethod = {};

streamingMethod.snapshot = function (logger, camera, cb) {

    var consumer = new MjpegConsumer();

    var parts = url.parse(camera.mjpeg);

    var httpx = parts.protocol === 'https:' ? https : http;

    if (camera.auth_name) {
        parts.auth = camera.auth_name + ':' + camera.auth_pass;
    }

    var req = httpx.get(parts, function(res) {

        if (res.statusCode === 200) {

            res.pipe(consumer);

            consumer.once('data', function (image) {
                req.abort();
                cb(image);
            });

        } else {
            logger.error(camera.mjpeg, res.statusCode, res.statusMessage);
        }

    }).on('error', function (err) {
        logger.error(camera.mjpeg, err);
    });
};

streamingMethod.stream = function (logger, camera, options, cb) {

    var consumer = new MjpegConsumer();

    var limiter;

    if (options.framerate > 0) {
        limiter = new Limiter(1000 / options.framerate);
    }

    var parts = url.parse(camera.mjpeg);

    var httpx = parts.protocol === 'https:' ? https : http;

    if (camera.auth_name) {
        parts.auth = camera.auth_name + ':' + camera.auth_pass;
    }

    var req = httpx.get(parts, function(res) {

        if (res.statusCode === 200) {

            var source = res.pipe(consumer);

            if (limiter) {
                source = source.pipe(limiter);
            }

            var ender = source.end;

            source.end = function () {
                ender.apply(source, arguments);
                source.emit('end');
            };

            source.once('end', function () {
                req.abort();
            });

            cb(source);

        } else {
            logger.error(camera.mjpeg, res.statusCode, res.statusMessage);
        }

    }).on('error', function (err) {
        logger.error(camera.mjpeg, err);
    });
};

module.exports = streamingMethod;
