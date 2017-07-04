var path = require('path');
var restify = require('restify');
var withings = require('./withings.js');
const bot = require('./bot.js');
var utils = require('./newUtils');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

server.post('/api/messages', bot.connector('*').listen());

server.get('/oauth/start', function (request, response, next) {

    var params = request.url.split('?')[1].split('&');

    /*
    1st parameter is channelId,
    2nd parameter is userId,
    */
    var channelId = params[0].split('=')[1];
    var userId = params[1].split('=')[1];

    withings.getWithingsLoginURL(channelId, userId, function (result) {
        if (result.status) {
            response.redirect(result.url, next);
        } else {
            response.send(result.error);
        }
    });

});

server.get('/oauth/callback', function (request, response, next) {

    var params = request.url.split('?')[1].split('&');

    /*
    1st parameter is userid,
    2nd parameter is authtoken,
    */
    var userId = params[0].split('=')[1];
    var authToken = params[1].split('=')[1];

    withings.saveUserTokenDetails(authToken, userId, function (result) {
        if (result.status) {
            response.redirect(result.url, next);
        } else {
            response.send(result.error);
        }
    });

});

server.get('/', function (request, response) {
    response.send("This is a Health Check Bot");
});

server.get('/api/getData', function (request, response) {

    var url_params = request.url.split("?")[1].split("&");

    /*
    1st parameter is userid,
    2nd parameter is accesstoken,
    3rd parameter is accesssecret,
    4th parameter is lastupdate
    */
    var userId = url_params[0].split('=')[1];
    var accessToken = url_params[1].split('=')[1];
    var accessSecret = url_params[2].split('=')[1];
    var lastUpdate = url_params[3].split('=')[1]

    withings.getDataSinceLastUpdate(userId, accessToken, accessSecret, lastUpdate, function (result) {
        if (result.status) {
            response.send(result.data);
        } else {
            response.send(result.error);
        }
    });

})

server.get('/oauth/doNotOpen', function (request, response) {
    response.send("Thank you for authorization :D");
});

server.get('/api/graphData', function (req, res) {

    var url_params = req.url.split("?")[1];
    var userId = url_params.split('=')[1];

    utils.getDataForGraph(userId, function (result) {
        if (result.status) {
            res.send({ validuser: true, measures: result.measures });
        } else if (result.notAvailable) {
            res.send({ validuser: false });
        } else {
            console.log(result.error);
            res.send({ validuser: false });
        }
    });
})

server.get(/\/?.*/, restify.serveStatic({
    directory: __dirname,
    default: 'index.html',
    match: /^((?!app.js).)*$/   // we should deny access to the application source
}));