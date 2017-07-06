var fs = require('fs');
var https = require('https');
var http = require('http');
var oauthSignature = require('oauth-signature');

var CONSUMER_KEY = '92970c7b8213498eb7ffe4f1c9f91d60252f506cff5dc8d8c2c562751b38';
var CONSUMER_SECRET = 'ed695455e9f1c48eb9961518695d75b1441ee4d3bd5484960f16dc57b74';

function NonceGenerator(length) {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (var i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function encodeQueryData(data) {
    let ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}

function nextURL(step, baseurl, authtoken, authsecret, callback, userid, lastupdate) {

    var httpMethod = 'GET';
    var url = baseurl;
    var nonce = NonceGenerator(32);
    var timestamp = Math.floor(Date.now() / 1000);

    var parameters = new Object();
    parameters["oauth_consumer_key"] = CONSUMER_KEY;
    parameters["oauth_nonce"] = nonce;
    parameters["oauth_timestamp"] = timestamp;
    parameters["oauth_signature_method"] = 'HMAC-SHA1';
    parameters["oauth_version"] = '1.0';

    if (step == 1) {

        parameters["oauth_callback"] = callback;

        var Signature = oauthSignature.generate(httpMethod, url, parameters, CONSUMER_SECRET, authsecret, { encodeSignature: false });

        parameters["oauth_signature"] = Signature;

        var get_URL = url + '?' + encodeQueryData(parameters);

        return get_URL;

    } else if (step == 2 || step == 3) {
        parameters["oauth_token"] = authtoken;

        var Signature = oauthSignature.generate(httpMethod, url, parameters, CONSUMER_SECRET, authsecret, { encodeSignature: false });

        parameters["oauth_signature"] = Signature;

        var get_URL = url + '?' + encodeQueryData(parameters);

        return get_URL;

    } else if (step == 4) {

        parameters["action"] = 'getmeas';
        parameters["oauth_token"] = authtoken;
        parameters["userid"] = userid;
        parameters["lastupdate"] = lastupdate;

        var Signature = oauthSignature.generate(httpMethod, url, parameters, CONSUMER_SECRET, authsecret, { encodeSignature: false });

        parameters["oauth_signature"] = Signature;

        var get_URL = url + '?' + encodeQueryData(parameters);

        return get_URL;
    }
}

/*
-> Executes the next function with an <object> as the argument
-> If <object>.status is true, then <object>.user has user details
-> otherwise if <object>.notAvailable is true, then user has not authorized the application
-> else <object>.error shows the error message.
*/
function hasUserAuthorisedChannel(channelId, channelUserId, next) {

    function testForChannel(user, channelId, channelUserId, next) {

        if (user.channels.length == 0) {
            next(false);
            return;
        }

        for (var i = 0; i < user.channels.length; i++) {
            if (user.channels[i].channelId == channelId && user.channels[i].channelUserId == channelUserId) {
                next(true);
                return;
            } else if (i == user.channels.length - 1) {
                next(false);
            }
        }
    }


    fs.readFile('./data/users.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
            return;
        } else {
            obj = JSON.parse(data);
            users = obj.users;

            if (users.length == 0) {
                next({ status: false, notAvailable: true });
                return;
            }

            for (var i = 0; i < users.length ; i++) {
                testForChannel(users[i], channelId, channelUserId, function (result) {
                    if (result) {
                        next({ status: true, user: users[i] });
                    } else if (i == users.length - 1) {
                        next({ status: false, notAvailable: true });
                    }
                });
            }
        }
    });
}

/*
Fetches the data for the user since the lastupdate time and stores in userData.json
-> Executes next function with an <object> as the argument
-> If <object>.status is true, then the sync was successful
-> otherwise <object>.error shows the error message
*/
function syncUserData(userId, accessCred, lastUpdate, next) {

    function sortfunction(a, b) {
        return a.date - b.date;
    }

    function makeUserData(measures, measuregrps, next) {
        if (measuregrps.length == 0) {
            next(measures);
        }
        for (var i = 0; i < measuregrps.length; i++) {
            var deviceMeasures = new Object();
            var flag = 0;
            for (var j = 0; j < measuregrps[i].measures.length; j++) {
                if (measuregrps[i].measures[j].type == 9) {
                    flag = 1;
                    deviceMeasures["dia"] = measuregrps[i].measures[j].value;
                } else if (measuregrps[i].measures[j].type == 10) {
                    flag = 1;
                    deviceMeasures["sys"] = measuregrps[i].measures[j].value;
                } else if (measuregrps[i].measures[j].type == 11) {
                    flag = 1;
                    deviceMeasures["pulse"] = measuregrps[i].measures[j].value;
                }
            }
            if (flag != 0) {
                var measure = { date: measuregrps[i].date, measures: deviceMeasures };
                measures.push(measure);
            }
            if (i == measuregrps.length - 1) {
                measures.sort(sortfunction);
                next(measures);
            }
        }
    }

    /*
    Updates the lastUpdate time of the user and executes the next function with <object> as the argument
    -> If <object>.status is true, implies updated successfully
    -> otherwise <object>.error shows the error message.
    */
    function updateUserLastUpdate(userId, newTime, next) {
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

    /*
    Fetches the userData since the lastupdate and executes the next function with <object> as the argument
    -> If <object>.status is true, <object>.data shows the data fetched
    -> otherwise <object>.error shows the error message
    */
    function getDataSinceLastUpdate(userId, accessToken, accessSecret, lastUpdate, next) {
        var url = 'https://wbsapi.withings.net/measure';
        var getDataUrl = nextURL(4, url, accessToken, accessSecret, null, userId, lastUpdate);

        https.get(getDataUrl, function (res) {
            var data = '';
            res.on('data', function (d) {
                data += d;
            });

            res.on('end', function () {
                data = JSON.parse(data);
                next({ status: true, data: data });
            });

        }).on('error', function (e) {
            next({ status: false, error: e });
        });
    }

    getDataSinceLastUpdate(userId, accessCred.accessToken, accessCred.accessSecret, lastUpdate, function (result) {

        if (result.status) {
            updateUserLastUpdate(userId, result.data.body.updatetime, function (result) {
                if (!result.status) {
                    console.log(result.error);
                }
            });

            fs.readFile('./data/userData.json', 'utf8', function readFileCallback(err, data) {
                if (err) {
                    next({ status: false, error: err });
                } else {
                    var obj = JSON.parse(data);
                    var userData = obj.userData;
                    for (var i = 0; i < userData.length; i++) {
                        if (userData[i].userId == userId) {
                            var measures = userData[i].measures;
                            makeUserData(measures, result.data.body.measuregrps, function (thisResult) {
                                userData[i].measures = thisResult;
                                userData = JSON.stringify({ userData: userData });
                                fs.writeFile('./data/userData.json', userData, 'utf8', function (err) {
                                    if (err) {
                                        next({ status: false, error: err });
                                    } else {
                                        next({ status: true });;
                                    }
                                });
                            });
                        }
                    }
                }
            });
        }
    });
}

function getDataForGraph(userId, next) {
    fs.readFile('./data/userData.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
        } else {
            var obj = JSON.parse(data);
            var userData = obj.userData;
            for (var i = 0; i < userData.length; i++) {
                if (userData[i].userId == userId) {
                    next({ status: true, measures: userData[i].measures });
                    return;
                } else if(i==userData.length-1){
                    next({ status: false, notAvailable: true });
                    return;
                }
            }
        }
    });
}

function fetchLastReading(userId, next) {
    fs.readFile('./data/userData.json', 'utf8', function readFileCallback(err, data) {
        if (err) {
            next({ status: false, error: err });
        } else {
            var obj = JSON.parse(data);
            var userData = obj.userData;
            for (var i = 0; i < userData.length; i++) {
                if (userData[i].userId == userId) {
                    if (userData[i].measures.length == 0) {
                        next({ status: false });
                        return;
                    } else {
                        next({ status: true, data: userData[i].measures[userData[i].measures.length - 1] });
                        return;
                    }
                }
            }
        }
    });
}

function getCases(channelId, channelUserId, next) {

    function fetchDataFromSecOpServer(secOpUserId, next) {

        var options = {
            host: 'secopserver4.azurewebsites.net',
            path: '/api/Chmahi/GetPatientCases',
            method: 'GET',
            headers: {
                patientid: secOpUserId,
                casestatus: -1
            }
        };
     
        var req = https.request(options, function (res) {
            var data = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                next({ status: true, data: data });
            });
        });

        req.end();
        req.on('error', function (e) {
            next({ status: false, error: e });
        });
    }



    hasUserAuthorisedChannel(channelId, channelUserId, function (result) {
        if (result.status) {
            for (var i = 0; i < result.user.channels.length; i++) {
                if (result.user.channels[i].channelId == "SecOp") {
                    fetchDataFromSecOpServer(result.user.channels[i].channelUserId, next);
                    return;
                } else if(i==result.user.channels.length - 1){
                    next({ status: false, notAvailable: true, current: true });
                }
            }
        } else if (result.notAvailable) {
            next({ status: false, notAvailable: true, current: false });
        } else {
            next({ status: false, error: result.error });
        }
    });
}

function makeSuggestionMessage(conversationData, next) {
    var bpState = conversationData.bpState;
    var isDiabetic = conversationData.isDiabetic;
    var doesWorkout = conversationData.doesWorkout;
    var kidneyProblemInFamily = conversationData.kidneyProblemInFamily;
    var heartProblemInFamily = conversationData.heartProblemInFamily;
    var doesSmoke = conversationData.doesSmoke;
    var doesDrink = conversationData.doesDrink;

    var message = "Your blood pressure is ";
    if (bpState == 2) {
        message += "**higher than normal**. \n\n";
    } else if (bpState == 3) {
        message += "**high** (Hypertension Stage 1).\n\n";
    } else {
        message += "**very high** (Hypertension Stage 2).\n\n";
    }

    if (kidneyProblemInFamily || heartProblemInFamily) {
        message += "Considering your family background, ";
        if (kidneyProblemInFamily && heartProblemInFamily) {
            message += "there is a **high chance** that you will face **heart/kidney problems**.";
        } else if (kidneyProblemInFamily) {
            message += "there is a high chance that you will face **kidney problems**.";
        } else {
            message += "there is a high chance that you will face **heart problems**.";
        }
        message += "Kindly consult a doctor for a diagnosis.\n\n"
    } else if (isDiabetic) {
        message += "Given that you are **diabetic**, you might encounter **heart / kidney problems**.\n\n"
    } else {
        message += "High Blood Pressure can be a reason for **heart / kidney problems**.\n\n"
    }

    message += "**Here is what you can do to control Blood Pressure:**\n\n";
    var count = 1;
    message += count + ". Follow a [DASH](http://dashdiet.org/default.asp) diet.\n";
    count++;
    if (!doesWorkout) {
        message += count + ". Exercise for at least 30mins a day.\n";
        count++;
    }
    if (doesSmoke) {
        message += count + ". Quit Smoking before it quits you :|\n";
        count++;
    }
    if (doesDrink) {
        message += count + ". Regulate your alcohol consumption\n";
        count++;
    }
    message += count + ". Stress is a major contributor in increasing Blood Pressure. Do not take much stress at work :)\n\nStay Healthy :D";

    next({ message: message });
}

function processbp(bp, diseaseIndex, next) {
    var bptype = getBPState(bp);
    var message = '';
    if (bptype == 0) {
        message += "You have **low blood pressure**, probably because of **dehydration**";
    } else if (diseaseIndex == 0 || diseaseIndex == 1 || diseaseIndex == 2) {
        switch (bptype) {
            case 1:
                message += "Your Blood Pressure is **under control**";
                break;
            case 2:
                message += "Your Blood Pressure is **high**";
                break;
            case 3:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor";
                break;
            case 4:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP";
                break;
            case 5:
                message += "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay";
                break;
            default:
                message += "Some problem with the software :(";
                break;
        }
    } else if (diseaseIndex == 3) {
        switch (bptype) {
            case 1:
                message += "Your Blood Pressure is **under control**";
                break;
            case 2:
                message += "Your Blood Pressure is **normal**. Nonetheless take necessary precautions as it might shoot up";
                break;
            case 3:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor";
                break;
            case 4:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP";
                break;
            case 5:
                message += "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay";
                break;
            default:
                message += "Some problem with the software :(";
                break;
        }
    } else {
        message += "Sorry I couldn't understand user input. Assuming that you do not have these diseases,"
        switch (bptype) {
            case 1:
                message += "Your Blood Pressure is **under control**";
                break;
            case 2:
                message += "Your Blood Pressure is **normal**. Nonetheless take necessary precautions as it might shoot up";
                break;
            case 3:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor";
                break;
            case 4:
                message += "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP";
                break;
            case 5:
                message += "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay";
                break;
            default:
                message += "Some problem with the software :(";
                break;
        }
    }
    next({ message: message });
}

function getBPState(bp) {
    /**********************************
    Encoding Scheme : 
    For Systolic Blood Pressure :
    0 -- <80
    1 -- 80 - 99
    2 -- 100 - 119
    3 -- 120 - 139
    4 -- 140 - 159
    5 -- 160 - 179
    6 -- >179

    For Diastolic Blood Pressure :
    0 -- <60
    1 -- 60 - 69
    2 -- 70 - 79
    3 -- 80 - 89
    4 -- 90 - 99
    5 -- 100 - 109
    6 -- >109
    ***********************************/
    var encodedsysbp = Math.floor((bp.sys - 60) / 20);
    var encodeddiabp = Math.floor((bp.dia - 50) / 10);

    encodeddiabp = (encodeddiabp < 1) ? 0 : encodeddiabp;
    encodedsysbp = (encodedsysbp < 1) ? 0 : encodedsysbp;

    encodeddiabp = (encodeddiabp > 5) ? 6 : encodeddiabp;
    encodedsysbp = (encodedsysbp > 5) ? 6 : encodedsysbp;

    var bptype;
    if ((encodeddiabp == 1 || encodeddiabp == 2) && (encodedsysbp == 1 || encodedsysbp == 2)) {
        bptype = 1;
    } else if (encodeddiabp == 0 || encodedsysbp == 0) {
        bptype = 0;
    } else {
        var temp = (encodedsysbp > encodeddiabp) ? encodedsysbp : encodeddiabp;
        bptype = temp -1;
    }
    /**********************************
    Return values : 
    0 -> Low BP
    1 -> Normal / Pre-Hypertension
    2 -> Hypertension Stage 1
    3 -> Hypertension Stage 2
    4 -> Blood Pressure Crisis (Hypertension Stage 3)
    **********************************/
    return bptype;
}

module.exports = {
    nextURL: nextURL,
    hasUserAuthorisedChannel: hasUserAuthorisedChannel,
    syncUserData: syncUserData,
    getDataForGraph: getDataForGraph,
    fetchLastReading: fetchLastReading,
    getCases: getCases,
    processbp: processbp,
    getBPState: getBPState,
    makeSuggestionMessage: makeSuggestionMessage
}