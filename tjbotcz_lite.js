//TJBot libs
var TJBot = require("tjbotczlib");
var conf = require("./configuration/config"); //tjConfig & local czech enhancements
var confCred = require("./configuration/credentials"); //credentials only
var fs = require("fs"); //filesystem
const await = require('asyncawait/await');

//Pigpio library for LED (simple version)
var gpio = require("pigpio").Gpio;
const _basic_colors = ["red", "green", "blue", "yellow", "magenta", "cyan", "white"];

var pinR = new gpio(conf.ledpins.R, { mode: gpio.OUTPUT });
var pinG = new gpio(conf.ledpins.G, { mode: gpio.OUTPUT });
var pinB = new gpio(conf.ledpins.B, { mode: gpio.OUTPUT });
var _RGBLed = { pinR, pinG, pinB };

//TJBot - Watson services
//---------------------------------------------------------------------
var credentials = confCred.credentials;
var hardware = ['microphone', 'speaker', 'servo', 'camera', 'rgb_led']; 
var tjConfig = conf.tjConfig;
var _paths = conf.paths;

var tj = new TJBot(hardware, tjConfig, credentials);

//Context object
var contextBackup; // last conversation context backup
var ctx = {}; // our internal context object


var sessionId; //conversation session

//---------------------------------------------------------------------
// Functions
//---------------------------------------------------------------------

//VISUAL RECOGNITION
//---------------------------------------------------------------------

/**
 * TAKE A FOTO
 */
function take_a_photo() {
  return new Promise(function (resolve, reject) {
    tj.takePhoto(_paths.picture.orig).then(function (data) {
      if (!fs.existsSync(_paths.picture.orig)) {
        reject("expected picture.jpg to have been created");
      } else {
        resolve("picture taken successfully");
      }
    });
    tj.play(_paths.music.take_a_picture);
  });
}

/**
 * CLASSIFY PHOTO
*/

async function classify_photo() {
  try {
    const response = await tj.recognizeObjectsInPhoto(_paths.picture.orig, credentials.visual_recognition);
    //console.log(response.body);
    const text = await photoClassificationToText(response.body);
    tj.speak('I think I can recognize these objects:' + text);
  } catch(error) {
    console.log(error);
  }
}



/**
 * helper for classify_photo() which returns only objects in picture with score > 0.5 and max 5 classes
 * @param objects - list of objects
 */
function photoClassificationToText(objects) {
  var jsonObj = JSON.parse(objects);
  console.log( Object.keys(jsonObj.result.tags).length);
  var foundObjects ='';
  var numberObjects = 0;
  for(var i = 0;i < Object.keys(jsonObj.result.tags).length;i++) {
      if (jsonObj.result.tags[i].confidence >= 0.4) {
          if (numberObjects < 5){
              foundObjects = foundObjects + ', ' + jsonObj.result.tags[i].tag.en;
              numberObjects = numberObjects + 1;
          } else {
              break;
          }
      }
  }

  console.log(foundObjects);
  return(foundObjects);
}

//CONVERSATION
//---------------------------------------------------------------------

/**
 * LISTEN
 */
function listen() {

  tj.sessionId(confCred.assId, function(response){
    sessionId = response;
    console.log('Conversation session ID is:' , sessionId);
  });

  tj.speak("Hello, my name is " + tj.configuration.robot.name + ". I am listening...");

  tj.listen(function (msg) {
    // check to see if they are talking to TJBot
    if (msg.indexOf(tj.configuration.robot.name) > -1) { //robot's name is in the text
      // remove our name from the message
      var msgNoName = msg.toLowerCase().replace(tj.configuration.robot.name.toLowerCase(), "");

      processConversation(msgNoName, function (response) {
        //console.log(JSON.stringify(response));
        //read response text from the service
        if (response.description) {
          var newResponse = response.description;
          if(response.description.includes("robot.name")){
            var b = newResponse.slice(-13, -1);
            var n = newResponse.indexOf("robot.name");
            if (n == 0) {
              var end = newResponse.slice(10, -1);
              newResponse = tj.configuration.robot.name + " " + end;
              converse(newResponse, response);
            } else if (b.includes("robot.name")) {
              var beginning = newResponse.slice(0, n);
              newResponse = beginning + " " + tj.configuration.robot.name
              converse(newResponse, response);
            } else {
              var beginning = newResponse.slice(0, n);
              var end = newResponse.slice((n+10), -1);
              newResponse = beginning + " " + tj.configuration.robot.name + " " + end;
              converse(newResponse, response);
            }
          } else {
            converse(newResponse, response);
          }
        }
      });
    }
  });
}

function converse(text, response) {
  tj.speak(text).then(function () {
    if (response.object.context.skills['main skill'].hasOwnProperty('user_defined')){
      if (response.object.context.skills['main skill'].user_defined.hasOwnProperty('action')) {
        var cmdType = response.object.context.skills['main skill'].user_defined.action.cmdType;
        var cmdPayload;
        if (response.object.context.skills['main skill'].user_defined.action.hasOwnProperty('cmdPayload')) {
          cmdPayload = response.object.context.skills['main skill'].user_defined.action.cmdPayload;
        }
        console.log(cmdType, cmdPayload);
        processAction(cmdType, cmdPayload);
      }

    }

  });
}

/**
 * Stop listening
 */
function stopListening() {
  tj.stopListening();

  var msg = "Listening was stopped.";
  tj.speak(msg);
  console.log(msg);
}

/**
 * PROCESS CONVERSATION
 * @param inTextMessage - text
 */
function processConversation(inTextMessage, callback) {
  if(contextBackup == null) {
    contextBackup = ctx;
    console.log(contextBackup);

  } else if(contextBackup.skills['main skill'].hasOwnProperty('user_defined')){
    console.log('nasel jsem user_defined');
    if(contextBackup.skills['main skill'].user_defined.hasOwnProperty('action')) delete contextBackup.skills['main skill'].user_defined.action;
    if(contextBackup.skills['main skill'].user_defined.hasOwnProperty('yes_photo')) delete contextBackup.skills['main skill'].user_defined.yes_photo;
    console.log(contextBackup);
  }
  // Object.assign(contextBackup, ctx);
  // send to the conversation service
  tj.converse(confCred.assId, sessionId, inTextMessage, contextBackup, function (response) {
    console.log(JSON.stringify(response, null, 2));
    contextBackup = response.object.context //.skills['main skill'].user_defined;
    console.log("CONTEXT: " + JSON.stringify(contextBackup));
    callback(response);
  });
}


//PROCESS ACTIONS
//---------------------------------------------------------------------
function processAction(cmd, payload) {
  switch (cmd) {
    case "tjbot_reset":
      resetTJBot();
      break;
    case "take_a_photo":
      take_a_photo().then(function () {
        tj.speak("I am done. You can classify objects now.");
      });
      break;
    case "classify_photo":
      classify_photo();
      break;
    case "read_text":
      //read_text();
      tj.speak("Unfortunately, the text recognition is not supported. You can classify objects now.");
      break;
    case "listen":
      listen();
      break;
    case "stop_listening":
      stopListening();
      break;
    case "led_turn_on":
      led_turn_on_all();
      break;
    case "led_turn_off":
      led_turn_off_all();
      break;
    case "led_change_color":
      led_change_color(payload.color);
      break;
    case "wave_arm":
      wave_arm(payload.position);
      break;
    default:
      console.log("Command not supported... " + cmd);
  }
}


//LED
//---------------------------------------------------------------------

//Turns off all the LED colors
//---------------------------------------------------------------------
function led_turn_off_all() {
  tj.turnOffRGBLed();
}

//Turns on all the LED on random color
//---------------------------------------------------------------------
function led_turn_on_all() {
  tj.turnOnRGBLed(function(ret_color){
    if(ret_color){
      console.log("Color is: " + ret_color);
    } else{
      console.log("LED did not turn on.");
    }
  });
}

//Changes the color of th RGB diode
//---------------------------------------------------------------------
function led_change_color(color){
  tj.changeColorRGBLed(color, function(ret_color){
    if(ret_color) {
      console.log("Color is: " + ret_color);
    } else {
      console.log("Color did not set.");
    }
  });
}

//ARM
//---------------------------------------------------------------------
function wave_arm(position) {
  switch (position) {
    case "back":
      tj.armBack();
      break;
    case "raised":
      tj.raiseArm();
      break;
    case "forward":
      tj.lowerArm();
      break;
    case "wave":
      tj.wave();
      break;
    default:
      tj.speak("I'm not able to set my arm into this position.");
  }
}


//RESET TJBOT
//---------------------------------------------------------------------
function resetTJBot() {
  
  tj.raiseArm();
  led_turn_off_all();
  tj.stopListening();
  listen();


/*
  tj.wave();
  tj.changeColorRGBLed("red", function(response){
    console.log(response);
  });
  tj.speak("What are hybrid cloud and A. I. solutions?");

  setTimeout(offLED,4000);
  */
}

function offLED(){
  tj.turnOffRGBLed()
  
}



//CALL INIT
//---------------------------------------------------------------------
resetTJBot();
