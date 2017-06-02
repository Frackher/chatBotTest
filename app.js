// Config Key placed at Heroku Dashboard!
// https://dashboard.heroku.com/apps/fast-temple-64164/settings

// Requirements
var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var fs = require('fs');

// Customer
var customer = {"name":"","loyalty":"","email":"","chatId":"","points":""};

//Flags
var flags = {"points":false};

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));


//Read the Json files
var messages = JSON.parse(fs.readFileSync('./words/messages.json', 'utf8'));
var badwords = JSON.parse(fs.readFileSync('./words/badwords.json', 'utf8'));

// Server index page
app.get("/", function (req, res) {
  res.send("We are online !");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
  if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
    console.log("Verified webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Verification failed. The tokens do not match.");
    res.sendStatus(403);
  }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
  // Make sure this is a page subscription
  if (req.body.object == "page") {
    // Iterate over each entry
    // There may be multiple entries if batched
    req.body.entry.forEach(function(entry) {
      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.postback) {
          processPostback(event);
        } else if (event.message) {
          processMessage(event);
        }
      });
    });

    res.sendStatus(200);
  }
});

// Processing Postback answer
function processPostback(event) {
  var senderId = event.sender.id;
  customer.chatId = event.sender.id;
  var payload = event.postback.payload;

  if (payload === "Greeting") {
    // Get user's first name from the User Profile API and include it in the greeting
    getUserInfo(senderId, "first_name", welcome);
  }
}

// Processing message
function processMessage(event) {
  if (!event.message.is_echo) {
      var message = event.message;
      var senderId = event.sender.id;
      customer.chatId = event.sender.id;

      console.log("Received message from senderId: " + senderId);
      console.log("Message is: " + JSON.stringify(message));

      // You may get a text or attachment but not both
      if (message.text) {
          var formattedMsg = message.text.toLowerCase().trim();

          // If we receive a text message, check to see if it matches any special
          // keywords and send back the corresponding movie detail.
          // Otherwise search for new movie.
          if(formattedMsg.match(/(point)/)){
            flags.points = true;
            sendMessage(senderId, {text: messages.questions.points});
          }
          //Asked for points
          if(flags.points){
            if(re = formattedMsg.match(/\d{12}/)){
              //Loyalty number
              customer.loyalty = re[0];
              sendMessage(senderId, {text: randomize(messages.reponses.carte)});
              requestAPI('https://api.kiabi.com/v2/loyalties/'+customer.loyalty, process.env.KEY_LOYALTY, true, searchPoints);

            } else if (re = formattedMsg.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/)) {
              //Customer Email
              customer.email = re[0];
              sendMessage(senderId, {text: randomize(messages.reponses.email)});
              requestAPIQs('https://api.kiabi.com/v1/anonymous/360customers/', process.env.KEY_CUSTOMER, true, {"email":customer.email}, catchFidByEmail);

            }
          }

          else
            sendMessage(senderId, {text: randomize(messages.comprendspas)});

      } else if (message.attachments) {
          sendMessage(senderId, {text: "Sorry, I don't understand your request."});
      }
  }
}

//Catch fidelity by email
function catchFidByEmail(obj){
  obj = JSON.parse(obj);
  obj = JSON.parse(obj[0]);

  if(typeof obj.loyalties == "undefined")
    console.log("pas de email");
  else {
    console.log(obj.loyalties.cardNumber);
  }
}

// Search points
function searchPoints(obj){
  obj = JSON.parse(obj);

  if(obj.error == "not_found")
    sendMessage(customer.chatId, {text: randomize(messages.erreurs.nofid)});
  else {
    customer.points = obj.points;
    sendMessage(customer.chatId, {text: randomize(messages.reponses.points)});
    flags.points = false;
  }
}

// Ask user info
function getUserInfo(senderId, requestedFields, callback){
  request({
    url: "https://graph.facebook.com/v2.6/" + senderId,
    qs: {
      access_token: process.env.PAGE_ACCESS_TOKEN,
      fields: requestedFields
    },
    method: "GET"
    }, function(error, response, body){
      //manage answers
      if(error) {
        console.log("Error getting user info: "+ error);
      } else {
        var bodyObj = JSON.parse(body);
        callback(senderId, bodyObj);
      }
  });
}

// Will welcome people
function welcome(senderId, obj){
  //requestAPI('https://api.kiabi.com/v2/loyalties/500007716959', process.env.KEY_LOYALTY, true);
  // Save customer name
  customer.name = obj.first_name

  var message = randomize(messages.greetings);
  sendMessage(senderId, {text: message});
}

// Choose a random content
function randomize(obj){
  var rand = obj[Math.floor(Math.random() * obj.length)];
  return customize(rand);
}

// Customize string with var
function customize(phrase){
  var mapObj = {
     '#name#':customer.name,
     '#ai.name#':messages.ai.name,
     '#cartefid#':customer.loyalty,
     '#email#':customer.email,
     '#points#':customer.points
  };
  phrase = phrase.replace(/#name#|#ai.name#|#cartefid#|#email#|#points#/gi, function(matched){
    return mapObj[matched];
  });

  return phrase;
}

// Request API
function requestAPI(url, apikey, auth, callback){
  var headers = {'accept': 'application/json', 'x-apikey': apikey};
  if(auth)
    headers = {'accept': 'application/json', 'x-apikey': apikey, 'authorization': process.env.AUTHORIZATION};

  request({
    url : url,
    headers: headers,
    method: "GET"
  }, function(error, response, body){
    if(error){
      console.log("Error api "+error);
    } else {
      console.log("API GO : "+response+body);
      callback(body)
    }
  });
}

// Request API
function requestAPIQs(url, apikey, auth, qs, callback){
  var headers = {'accept': 'application/json', 'x-apikey': apikey};
  if(auth)
    headers = {'accept': 'application/json', 'x-apikey': apikey, 'authorization': process.env.AUTHORIZATION};

  request({
    url : url,
    headers: headers,
    qs : qs,
    method: "GET"
  }, function(error, response, body){
    if(error){
      console.log("Error api "+error);
    } else {
      console.log("APIQS GO : "+response+body);
      console.dir(body);
      callback(body)
    }
  });
}

// sends message to user
function sendMessage(recipientId, message) {
  request({
    url: "https://graph.facebook.com/v2.6/me/messages",
    qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
    method: "POST",
    json: {
      recipient: {id: recipientId},
      message: message,
    }
  }, function(error, response, body) {
    if (error) {
      console.log("Error sending message: " + response.error);
    }
  });
}
