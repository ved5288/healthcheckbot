var builder = require('botbuilder');
var utils = require('./newUtils');

var urlBase = 'https://healthcheckbot.azurewebsites.net';

// Create chat bot and listen to messages
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID || 'd230eea3-8115-432f-a105-8d22715a0479',
    appPassword: process.env.MICROSOFT_APP_PASSWORD || 'phveU1CVfcdS0AKg75n8vXQ'
});

const bot = new builder.UniversalBot(connector);

module.exports = bot;

bot.dialog('/', [
    function (session) {
        var text = session.message.text;
        var cmd = text.toLowerCase();

        // Next action routing
        if (cmd.includes('view')) {
            session.beginDialog('/view');
        } else if (cmd.includes('cases')) {
            session.beginDialog('/cases');
        } else if(cmd.includes('logout')){
            session.beginDialog('/logout');
        } else if(cmd.includes('help')){
            sendHelpMessage(session.message, bot, `Hi, I'm a Blood Pressure Tracker bot!!`);
        } else {
            sendHelpMessage(session.message, bot, `Sorry, I couldn't understand you!!`);
        }
    }
]);

var Diseases = ['Diabetes', 'Kidney Problems', 'Heart Disease', 'None'];

bot.dialog('/logout', function (session) {
    session.userData = {};
    session.endConversation("You have successfully logged out");
});

bot.dialog('/view', function (session) {
        utils.hasUserAuthorisedChannel(session.message.address.channelId, session.message.address.user.id, function (result) {
            if (result.status) {
                session.userData = result.user;
                session.beginDialog('/fetchData');
            } else if (result.notAvailable) {
                session.beginDialog('/authorize');
            } else {
                sendMessage(session.message, bot, result.error);
            }
        });

});

bot.dialog('/authorize', function (session) {
    var url = urlBase + '/oauth/start?channelId=' + session.message.address.channelId + '&channelUserId=' + session.message.address.user.id;
    sendCardMessage(session, bot, "Please Authorize the Application", "Request again after authorizing", "Click to Authorize", url);
    session.endDialog();
});

bot.dialog('/fetchData', function (session) {
    utils.syncUserData(session.userData.userId, session.userData.accessCred, session.userData.lastUpdate, function (result) {
        if (!result.status) {
            console.log(result.error);
            session.endDialog();
        } else {
            session.beginDialog('/showData');
            session.endDialog();
        }
    });
});

bot.dialog('/showData', function (session) {
    utils.fetchLastReading(session.userData.userId, function (result) {
        if (result.status) {
            session.conversationData = { sys: result.data.measures.sys, dia: result.data.measures.dia, date: result.data.date };
            var bpState = utils.getBPState({ sys: result.data.measures.sys, dia: result.data.measures.dia });
            session.conversationData["bpState"] = bpState;
            sendMessage(session.message, bot, "Your last BP measured to be " + result.data.measures.sys + "/" + result.data.measures.dia + " and was taken on " + (new Date(result.data.date * 1000)).toDateString());
            var url = urlBase + '/static/graph.html?userId=' + session.userData.userId;
            sendCardMessage(session, bot, "Your Blood Pressure History", null, "Click to view history", url);

            switch (bpState) {
                case 0:
                    session.beginDialog('/lowBP');
                    break;
                case 1:
                    sendMessage(session.message, bot, "Your blood pressure is **normal** :)");
                    break;
                case 2:
                case 3:
                    session.beginDialog('/highBP');
                    break;
                case 4:
                    sendMessage(session.message, bot, "Your blood is **very high** (Hypertension Stage 3). Seek **emergency care** without any delay !");
                    break;
                default:
                    console.log("Error in /showData dialog. Please check the code");
                    break;
            }
        } else {
            sendMessage(session.message, bot, "You haven't taken any measurements yet!");            
        }
    })
});

bot.dialog('/cases', function (session) {
    utils.getCases(session.message.address.channelId, session.message.address.user.id, function (result) {
        if (result.status) {
            var data = JSON.parse(result.data);
            makeCardAttachments(session, data, function(result){
                var reply = new builder.Message(session)
                                .attachmentLayout(builder.AttachmentLayout.carousel)
                                .attachments(result.cards);
                session.send(reply);
                session.endDialog();
            });
        } else if (result.notAvailable) {
            if (current) {
                sendMessage(session.message, bot, "Please authorize from the Second Opinion account");
            } else {
                session.beginDialog('/authorize');
                session.endDialog();
            }
        } else {
            console.log(result.error);
            session.endDialog();
        }
    });
});

bot.dialog('/lowBP', function (session) {
    sendMessage(session.message, bot, "You have **low BP**");
    session.endDialog();
});

bot.dialog('/highBP', [
    
    // Prompt for Diabetes
    function (session) {
        builder.Prompts.choice(session, "Are you diabetic?", ["Yes", "No"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["isDiabetic"] = true;
        } else {
            session.conversationData["isDiabetic"] = false;
        }
        next();
    },

    // Prompt for Exercise
    function (session) {
        builder.Prompts.choice(session, "Do you workout for more than 30 mins in a day?", ["Yes", "No"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["doesWorkout"] = true;
        } else {
            session.conversationData["doesWorkout"] = false;
        }
        next();
    },

    // Prompt for Kidney Problems in the family
    function (session) {
        builder.Prompts.choice(session, "Do any of your close relatives have Kidney Problems?", ["Yes", "No", "I don't know"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["kidneyProblemInFamily"] = true;
        } else {
            session.conversationData["kidneyProblemInFamily"] = false;
        }
        next();
    },

    // Prompt for Heart Problems in the family
    function (session) {
        builder.Prompts.choice(session, "Do any of your close relatives have Heart Diseases?", ["Yes", "No", "I don't know"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["heartProblemInFamily"] = true;
        } else {
            session.conversationData["heartProblemInFamily"] = false;
        }
        next();
    },

    // Prompt for Smoking
    function (session) {
        builder.Prompts.choice(session, "Do you smoke?", ["Yes", "No"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["doesSmoke"] = true;
        } else {
            session.conversationData["doesSmoke"] = false;
        }
        next();
    },

    // Prompt for Alcohol Comsumption
    function (session) {
        builder.Prompts.choice(session, "Do you regularly consume alcohol?", ["Yes", "No"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        if (results.response.index == 0) {
            session.conversationData["doesDrink"] = true;
        } else {
            session.conversationData["doesDrink"] = false;
        }
        next();
    },
    
    function (session) {
        utils.makeSuggestionMessage(session.conversationData, function (result) {
            sendMessage(session.message, bot, result.message);
        });
        session.endDialog();
    }
]);

bot.dialog('/diseaseLink', [
    function (session) {
        builder.Prompts.choice(session, "Do you have any of these diseases?", ["Diabetes", "Heart Diseases", "Kidney Problems", "None"], { listStyle: builder.ListStyle["button"] });
    },
    function (session, results, next) {
        session.dialogData.destination = results.response;
        utils.processbp({ sys: session.conversationData.sys, dia: session.conversationData.dia }, results.response.index, function (result) {
            sendMessage(session.message, bot, result.message);
            session.endDialog();
        });
    }
]);


function makeCardAttachments(session, data, next) {

    var cards = new Array();

    for (var i = 0; i < data.length; i++) {
        var description = (JSON.parse(data[i].description)).Value0;
        var statusText = '';
        switch (data[i].casestatus) {
            case 0:
                statusText = "Pending";
                break;
            case 1:
                statusText = "Ongoing";
                break;
            case 2:
                statusText = "Completed";
                break;
            default:
                statusText = "Error";
        }
        cards.push( 
            new builder.HeroCard(session)
                    .title('Case# ' + data[i].caseid + ' (' + statusText + ')')
                    .subtitle(description + ' (' + data[i].specialization + ')')
                    .text(makeCaseMessage(data[i].doctorname, data[i].verdict))
        )
        if (i == data.length - 1) {
            next({ cards: cards });
        }
    }
}



/*
bot.dialog('/diseaseLink', [
    function (session, args) {

        var userid = fetchuserid().userid;
        var currentuserdata = new Object();

        for (var i = 0; i < userdata.length; i++) {
            if (userdata[i].userid == userid) {
                currentuserdata = userdata[i];
                break;
            }
        }

        if (currentuserdata.measures.length == 0) {
            sendMessage(session.message, bot, "No Measurements Taken Yet");
        } else {
            var lastdata = currentuserdata.measures[currentuserdata.measures.length - 1];

            var date = lastdata.date * 1000;
            var sys = null;
            var dia = null;

            for (var i = 0; i < lastdata.measures.length; i++) {
                if (lastdata.measures[i].type == 9) {
                    dia = lastdata.measures[i].value;
                } else if (lastdata.measures[i].type == 10) {
                    sys = lastdata.measures[i].value;
                }
            }

            var bptype = processbp(sys + "/" + dia);

            if (bptype == 0) {
                sendMessage(session.message, bot, "You have **low blood pressure**, probably because of **dehydration**");
            } else if (args == "Diabetes" || args == "Kidney Problems" || args == "Heart Disease") {
                switch (bptype) {
                    case 1:
                        sendMessage(session.message, bot, "Your Blood Pressure is **under control**");
                        break;
                    case 2:
                        sendMessage(session.message, bot, "Your Blood Pressure is **high**");
                        break;
                    case 3:
                        sendMessage(session.message, bot, "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor");
                        break;
                    case 4:
                        sendMessage(session.message, bot, "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP");
                        break;
                    case 5:
                        sendMessage(session.message, bot, "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay");
                        break;
                    default:
                        sendMessage(session.message, bot, "Some problem with the software :(");
                        break;
                }
            } else if (args == "None") {
                switch (bptype) {
                    case 1:
                        sendMessage(session.message, bot, "Your Blood Pressure is **under control**");
                        break;
                    case 2:
                        sendMessage(session.message, bot, "Your Blood Pressure is **normal**. Nonetheless take necessary precautions as it might shoot up");
                        break;
                    case 3:
                        sendMessage(session.message, bot, "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor");
                        break;
                    case 4:
                        sendMessage(session.message, bot, "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP");
                        break;
                    case 5:
                        sendMessage(session.message, bot, "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay");
                        break;
                    default:
                        sendMessage(session.message, bot, "Some problem with the software :(");
                        break;
                }
            } else {
                var text = "Sorry I couldn't understand user input. Assuming that you do not have these diseases,"
                switch (bptype) {
                    case 1:
                        sendMessage(session.message, bot, text + "Your Blood Pressure is **under control**");
                        break;
                    case 2:
                        sendMessage(session.message, bot, text + "Your Blood Pressure is **normal**. Nonetheless take necessary precautions as it might shoot up");
                        break;
                    case 3:
                        sendMessage(session.message, bot, text + "Your Blood Pressure is **high** (Hyptertension Stage 1). Please consult your doctor");
                        break;
                    case 4:
                        sendMessage(session.message, bot, text + "Your Blood Pressure is **high** (Hyptertension Stage 2). Please consult your doctor ASAP");
                        break;
                    case 5:
                        sendMessage(session.message, bot, text + "It is a case of **High Blood Pressure Crisis**. Seek **emergency care** without any further delay");
                        break;
                    default:
                        sendMessage(session.message, bot, "Some problem with the software :(");
                        break;
                }
            }
        }

        session.endDialog();
    }
]);
*/

bot.on('conversationUpdate', (msg) => {
    console.log("Hey:", msg);
    console.log('Sample app was added to the team');
    //if (!msg.eventType === 'teamMemberAdded') return;
    if (!Array.isArray(msg.membersAdded) || msg.membersAdded.length < 1) return;
    var members = msg.membersAdded;

    // Loop through all members that were just added to the team
    for (var i = 0; i < members.length; i++) {

        // See if the member added was our bot
        if (members[i].name.includes('Bot')) {
            sendHelpMessage(msg, bot, `Hi, I'm a Blood Pressure Tracker bot!!`);
        }
    }
});

function makeCaseMessage(doctor, verdict) {
    var text = '';
    if (verdict) {
        text = text + `Verdict: ${verdict}, `;
    }
    text += `Doctor: ${doctor}`;
    return text;
}

// Helper method to send a text message
function sendMessage(message, bot, text) {
    var msg = new builder.Message()
		.address(message.address)
		.textFormat(builder.TextFormat.markdown)
		.text(text);

    bot.send(msg, function (err) { });
}

// Helper method to send a generic help message
function sendHelpMessage(message, bot, firstLine) {
    var text = `##${firstLine} \n\n Here's what I can help you do \n\n`
    text += `To view your Blood Pressure readings, you can type **view**\n\n To view the details of your cases, you can type **cases**`;

    sendMessage(message, bot, text);
}

// Helper method to generate a card message for a given task.
function sendCardMessage(session, bot, title, text, button, url) {

    var card = new builder.ThumbnailCard()
		.title(title)
        .text(text)
		.buttons([
			builder.CardAction.openUrl(null, url, button)
		]);

    var msg = new builder.Message()
		.address(session.message.address)
		.textFormat(builder.TextFormat.markdown)
		.addAttachment(card);

    bot.send(msg, function (err, addresses) {
        if (err) {
            console.log(err);
        }
    });
}
