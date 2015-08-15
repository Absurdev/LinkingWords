/* jslint node: true */

(function () {
    "use strict";

    var express = require('express'),
        bodyParser = require('body-parser'),
        app = express(),
        server = require('http').createServer(app),
        io = require('socket.io')(server, {
            pingTimeout: 600000
        }),
        nconf = require("nconf");

    nconf.argv()
        .env()
        .file({
            file: 'config.json'
        });

    var api = require("./src/api-v1.js");
    var linkingwords = require("./src/linkingwords.js")(io);

    var renderingVars = process.env.NODEJS_DEV_ENV ? {
        script_config: 'js/config.dev.js',
        client_js: 'js/linkingwords-client.js',
        client_css: 'css/main.css'
    } : {
        script_config: 'js/config.prod.js',
        client_js: 'js/linkingwords-client.min.js',
        client_css: 'css/main.min.css'
    };


    /******************
     *
     * Express config
     *
     *****************/

    app.set('view engine', 'ejs');
    app.use(bodyParser.json());
    app.use(express.static('static'));

    // Routing
    app.get('/', function (req, res) {
        res.render(__dirname + '/views/index', renderingVars);
    });

    app.get('/master/', function (req, res) {
        res.render(__dirname + '/views/master', renderingVars);
    });

    app.post('/quit', function (req, res) {
        var userId = req.body.userId;
        linkingwords.releaseResourceForUser(userId);
        res.send("ok");
    });

    // API

    app.get('/api/v1/stats', function (req, res) {
        api.getGlobalStats(res);
    });

    app.get('/api/v1/stats/ui', function (req, res) {
        api.getGlobalStatsUi(res);
    });

    app.get('/api/v1/stats/word/:word', function (req, res) {
        api.getStatsForWord(req.params.word, res);
    });

    app.get('/api/v1/stats/leaders-boards', function (req, res) {
        api.getLeadersBoards(res);
    });

    app.get('/api/v1/user-gc', function (req, res) {
        api.getUserGC(res);
    });

    app.get('/api/v1/connections', function (req, res) {
        api.getConnections(res);
    });


    server.listen(nconf.get('listen-port'));
}());
