var https = require('https');
var fs = require('fs');
var utils = require('./newUtils.js')

var URL_START = 'http://73fa5f5e.ngrok.io';
var CALLBACK_URL = URL_START + '/oauth/callback';

/*
getWithingsLoginURL send to the next function an object with two keys *status*

If status is true, the request was success and the second key is *url* which we need to go to to authorize the application
If status is false, the request failed and the second key is *error* which gives the error message.
*/
function getWithingsLoginURL(channelId, channelUserId, next) {
    var url = 'https://developer.health.nokia.com/account/request_token';
    var getData_url = utils.nextURL(1, url, null, null, CALLBACK_URL, null, null);

    https.get(getData_url, function (res) {
        var data = '';
        res.on('data', function (d) {
            data += d;
        });

        res.on('end', function () {
            var token = data.split("&");
            if (token.length != 2) {
                console.log(token);
                next({ status: false, error: "Erratic Request" });
                return;
            } else {
                var accessToken = token[0].split("=")[1];
                var accessSecret = token[1].split("=")[1];

                var url_ = 'https://developer.health.nokia.com/account/authorize';
                var withingsUrl = utils.nextURL(2, url_, accessToken, accessSecret, null, null, null);

                fs.readFile('./data/token.json', 'utf8', function readFileCallback(err, data) {
                    if (err) {
                        console.log(err);
                        next({ status: false, error: "Erratic Request" });
                        return;
                    } else {
                        obj = JSON.parse(data); //now it an object
                        obj.tokenList.push({ channelId: channelId, channelUserId: channelUserId, authToken: accessToken, authSecret: accessSecret }); //add token data
                        json = JSON.stringify(obj); //convert it back to json

                        console.log(json);

                        fs.writeFile('./data/token.json', json, 'utf8', function (err) {
                            if (err) {
                                console.log(err);
                                next({ status: false, error: "Erratic Request" });
                                return;
                            } else {
                                next({ status: true, url: withingsUrl });
                                return;
                            }
                        }); // write it back to disk
                    }
                }); // SAVE TOKEN DATA
                
            }
        });
    }).on('error', function (e) {
        next({ status: false, error: e });
        return;
    });
}

function isUserIdPresent(userId, next) {
    fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            obj = JSON.parse(data);
            users = obj.users;
            for (var i = 0; i < users.length ; i++) {
                if (users[i].userId == userId) {
                    next({ status: true, user: users[i] });
                    return;
                }
            }
            next({ status: false, notAvailable: true });
            return;
        }
    });
}

function findUserViaChannel(channelId, channelUserId, next) {

    fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            obj = JSON.parse(data);
            users = obj.users;

            findFromUsersGivenChannel(users, channelId, channelUserId, next);

            function findFromUsersGivenChannel(users, cId, cUserId, next) {
                for (var i = 0; i < users.length; i++) {
                    hasUserAuthorisedChannel(users[i], cId, cUserId, function (result) {
                        if (result) {
                            next({
                                status: true, user: {
                                    userId: users[i].userId,
                                    accessCred: users[i].accessCred,
                                    lastUpdate: users[i].lastUpdate
                                }
                            });
                            return;
                        } else if (i == users.length - 1) {
                            var url = URL_START + '/oauth/start?channelId=' + cId + '&channelUserId=' + cUserId;
                            next({ status: false, notAvailable: true, url: url });
                        }
                    });
                }     
            }

            function hasUserAuthorisedChannel(user, cId, cUserId, next) {
                for (var i = 0; i < user.channels.length; i++) {
                    if (user.channels[i].channelId == cId && user.channels[i].channelUserId == cUserId) {
                        next(true);
                        return;
                    } else if (i == user.channels.length - 1) {
                        next(false);
                        return;
                    }
                }
            }
        }
    });
}

function saveUserTokenDetails(authToken, userId, next) {

    var authSecret = '';
    var channelId = '';
    var channelUserId = '';
    var tokens = new Array();

    console.log("Reached Here");

    fs.readFile('./data/token.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });      
            return;
        } else {
            obj = JSON.parse(data);
            tokens = obj.tokenList;

            console.log(tokens);

            for (var i = 0; i < tokens.length; i++) {
                if (tokens[i].authToken == authToken) {
                    channelId = tokens[i].channelId;
                    channelUserId = tokens[i].channelUserId;
                    authSecret = tokens[i].authSecret;
                    tokens.splice(i, 1);

                    console.log("channel : " + channelUserId);

                    break;
                }
            }

            var obj = { tokenList: tokens };
            var json = JSON.stringify(obj);

            fs.writeFile('./data/token.json', json, 'utf8', function (err) {
                if (err) {
                    next({ status: false, error: err });     
                    return;
                } else {

                    isUserIdPresent(userId, function (result) {
                        if (!result.status) {
                            if (result.notAvailable) {
                                // Make a new User
                                makeNewUser(authToken, authSecret, channelId, channelUserId, userId, next);
                            } else {
                                next({ status: false, error: result.error });
                            }
                        } else {
                            addChannelToUser(userId, channelId, channelUserId, next);
                        }
                    });
                }
            });
        }
    }); 
}

function addChannelToUser(userId, channelId, channelUserId, next) {
    fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            var obj = JSON.parse(data);
            var users = obj.users;
            var flag = 0;

            findAndSetUser(users, userId, next);

            function setUser(user, cId, cUserId, next) {
                for (var j = 0; j < user.channels.length; j++) {
                    if (user.channels[j].channelId == cId) {
                        user.channels[j].channelUserId = cUserId;
                        next({ status: true, user: user });
                        return;
                    }
                }
                next({ status: false });
            }

            function findAndSetUser(users, userId, next) {
                for (var j = 0; j < users.length; j++) {
                    if (users[j].userId == userId) {
                        var secOpUrl = URL_START + "/oauth/doNotOpen?userid=" + users[j].userId + "&accesstoken=" + users[j].accessCred.accessToken + "&accesssecret=" + users[j].accessCred.accessSecret;
                        setUser(users[j], channelId, channelUserId, function (result) {
                            if (result.status) {
                                users[j] = result.user;
                            } else {
                                users[j].channels.push({ channelId: channelId, channelUserId: channelUserId });
                            }
                            var json = JSON.stringify({ users: users });

                            fs.writeFile('./data/users.json', json, 'utf8', function (err) {
                                if (err) {
                                    next({ status: false, error: err });
                                } else {
                                    next({ status: true, url: secOpUrl });;
                                }
                            });
                        });
                        return;
                    }
                }
                next({ status: false, error: "Incompetency in two functions - ReCheck Code" });
                return;
            }
        }
    });
}
    
function makeNewUser(authToken, authSecret, channelId, channelUserId, userId, next) {
    var httpMethod = 'GET';
    var url = 'https://developer.health.nokia.com/account/access_token';
    var getDataUrl = utils.nextURL(3, url, authToken, authSecret, null, null, null);

    https.get(getDataUrl, function (res) {

        var data = '';
        res.on('data', function (d) {
            data += d;
        });

        res.on('end', function () {

            var token = data.split("&");

            if (token.length != 4) {
                next({ status: false, error: "Erratic Request" });
                return;
            } else {
                var authToken = token[0].split("=")[1];
                var authSecret = token[1].split("=")[1];

                var user = new Object();
                user["userId"] = userId;
                user["accessCred"] = new Object();
                user.accessCred["accessToken"] = authToken;
                user.accessCred["accessSecret"] = authSecret;
                user["lastUpdate"] = 0;
                user["channels"] = new Array();
                user.channels.push({ channelId: channelId, channelUserId: channelUserId });

                fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
                    if (err) {
                        next({ status: false, error: err });      
                        return;
                    } else {
                        var obj = JSON.parse(data);
                        obj.users.push(user);
                        var json = JSON.stringify(obj);
                        fs.writeFile('./data/users.json', json, 'utf8', function (err) {
                            if (err) {
                                next({ status: false, error: err });      
                                return;
                            } else {
                                fillUserMeasurements(authToken, authSecret, userId, next);
                            }
                        });
                    }
                });               
            }
        });
    }).on('error', function (e) {
        console.error("ERROR: ", e);
        return;
    });

}

function fillUserMeasurements(authToken, authSecret, userId, next) {

    var newUser = new Object;
    newUser["userId"] = userId;
    newUser["measures"] = new Array();

    var secOpUrl = URL_START + "/oauth/doNotOpen?userId=" + userId + "&accessToken=" + authToken + "&accessSecret=" + authSecret;

    fs.readFile('./data/userData.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            obj = JSON.parse(data); 
            obj.userData.push(newUser); 
            json = JSON.stringify(obj); 
            fs.writeFile('./data/userData.json', json, 'utf8', function (err) {
                if (err) {
                    next({ status: false, error: err });
                    return;
                } else {
                    next({ status: true, url: secOpUrl });
                    return;
                }
            });
        }
    }); 
}

function updateUserMeasurementsInDatabase(userData) {
    getDataSinceLastUpdate(userData.userId, userData.accessCred.accessToken, userData.accessCred.accessSecret, userData.lastUpdate, function (result) {
        if (result.status) {
            console.log(result.data)

            updateLastUpdateInDatabase(userData.userId, result.data.body.updatetime, function (result) {
                if (!result.status) {
                    console.log("DEBUG: " + result.error);
                }
            });

            function makeUserDataObject(user, measureGrps, next) {
                if (measureGrps.length == 0) {
                    next({ user: user });
                    return;
                }
                for (var i = 0; i < measureGrps.length; i++) {
                    user.measures.push({ date: measureGrps[i].date, measures: measureGrps[i].measures });
                    if (i == measureGrps.length - 1) {
                        next({ user: user });
                    }
                }
            }

            fs.readFile('./data/userData.json', 'utf8', function readFileCallback(err, data) {
                if (err) {
                    next({ status: false, error: err });
                    return;
                } else {
                    obj = JSON.parse(data);
                    userData = obj.userData;

                    findFromUsersGivenChannel(users, channelId, channelUserId, next);

                }
            });
            

        } else {
            // Error
            console.log(result.error);
        }
    });
}

function updateLastUpdateInDatabase(userId, newTime, next) {
    fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            var obj = JSON.parse(data);
            var users = obj.users;
            var flag = 0;

            for (var i = 0; i < users.length; i++) {
                if (users[i].userId == userId) {
                    users[i].lastUpdate = newTime;
                    var json = JSON.stringify({ users: users });

                    fs.writeFile('./data/users.json', json, 'utf8', function (err) {
                        if (err) {
                            next({ status: false, error: err });
                        } else {
                            next({ status: true });;
                        }
                    });
                }
            }
        }
    });
}

function getDataSinceLastUpdate(userId, accessToken, accessSecret, lastUpdate, next) {
    var url = 'https://wbsapi.withings.net/measure';
    var getDataUrl = utils.nextURL(4, url, accessToken, accessSecret, null, userId, lastUpdate);

    https.get(getDataUrl, function (res) {
        var data = '';
        res.on('data', function (d) {
            data += d;
        });

        res.on('end', function () {
            data = JSON.parse(data);
            next({ status: true, data: data });
            return;
        });

    }).on('error', function (e) {
        next({ status: false, error: e });
        return;
    });
}

module.exports = {
    getWithingsLoginURL: getWithingsLoginURL,
    saveUserTokenDetails: saveUserTokenDetails,
    getDataSinceLastUpdate: getDataSinceLastUpdate,
    findUserViaChannel: findUserViaChannel,
    updateUserMeasurementsInDatabase: updateUserMeasurementsInDatabase
};