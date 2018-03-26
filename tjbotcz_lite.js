//TJBot libs
var TJBot = require("tjbot");
var conf = require("./config"); //tjConfig & local czech enhancements
var confCred = require("./credentials"); //credentials only
var fs = require("fs"); //filesystem

//Pigpio library for LED (simple version)
var gpio = require("pigpio").Gpio;
const _basic_colors = ["red", "green", "blue", "yellow", "magenta", "cyan", "white"];

var pinR = new gpio(conf.ledpins.R, {mode: gpio.OUTPUT});
var pinG = new gpio(conf.ledpins.G, {mode: gpio.OUTPUT});
var pinB = new gpio(conf.ledpins.B, {mode: gpio.OUTPUT});
var _RGBLed = {pinR, pinG, pinB};

//REST API
var express    = require('express');
var bodyParser = require('body-parser');

//TJBot - Watson services
//---------------------------------------------------------------------
var credentials = confCred.credentials;
var hardware = ['microphone', 'speaker', 'servo', 'camera']; //simple 'rgb_led' as part of this file
var tjConfig = conf.tjConfig;
var _paths = conf.paths;

var tj = new TJBot(hardware, tjConfig, credentials);


//REST API & chat client
//---------------------------------------------------------------------
function initRestAPI(){
  var restAPI = express();
  restAPI.use(bodyParser.urlencoded({ extended: true }));
  restAPI.use(bodyParser.json());

  var port = 80;
  var router = express.Router();

  router.get('/', function(req, res) {
  	res.json({ message: 'Hello, this is TJBot\'s REST API!' });
  });

  router.route('/converse')
  	.get(function(req, res) {
  		res.json({ "error": 'Use [POST] instead!' });
  	})
  	.post(function(req, res) {
  		if (req.body.message){
  			console.log("[REST API] message: " + req.body.message);

        processConversation(req.body.message, function(response){
          res.json({ message: response.description });
          
          //read response text from the service
          // if(response.description){
          //   tj.speak(response.description).then(function(){
          //     if (response.object.context.hasOwnProperty('action')){
          //       var cmdType = response.object.context.action.cmdType;
          //       var cmdPayload;
          //       if (response.object.context.action.hasOwnProperty('cmdPayload')) {
          //         cmdPayload = response.object.context.action.cmdPayload;
          //       }
          //       processAction(cmdType, cmdPayload);
          //     }
          //   });
          // }
        });
  		} else {
  			var err = "[REST API] 'message' block is missing in the POST payload";
  			console.error(err);
  			res.json({ "error": err });
  		}
  	});

  restAPI.use('/rest', router);
  restAPI.use(express.static(__dirname + '/public'));

  restAPI.listen(port);
  console.log('RestAPI is active on port ' + port);
}

//---------------------------------------------------------------------
// Functions
//---------------------------------------------------------------------

//VISUAL RECOGNITION
//---------------------------------------------------------------------

/**
 * TAKE A FOTO
 */
function take_a_photo(){
  return new Promise(function(resolve, reject) {
    tj.takePhoto(_paths.picture.orig).then(function(data) {
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
function classify_photo(){
  tj.recognizeObjectsInPhoto(_paths.picture.orig).then(function(objects){
      console.log(JSON.stringify(objects, null, 2));
       
      photoClassificationToText(objects, function(text){
          tj.speak(text);
      });
  });
}

/**
 * helper for classify_photo() which returns only objects in picture with score > 0.5 and max 5 classes
 * @param objects - list of objects
 */
function photoClassificationToText(objects, callback){
  var text = "";
  var numOfClasses = 0;
  var maxNumOfClasses = 5;
  objects.sort(function(a,b){return b.score - a.score;});
  for( var j = 0; j < objects.length; j++){
      if(objects[j].score >= 0.5){
        if (numOfClasses) text =  text + ',';
        text = text + " " + objects[j].class;
        numOfClasses++;
        if(numOfClasses >=  maxNumOfClasses) break;
      }

  }
  if (text != "") {
    text = "I think I can see: " + text + ".";
  } else {
    text = "I can't recognize what is in the picture.";
  }
  callback(text);
}

/**
 * READ TEXT
 */
function read_text(){
  tj.recognizeTextInPhoto(_paths.picture.orig).then(function(texts){
      console.log(JSON.stringify(texts, null, 2));

      if(texts.images[0].hasOwnProperty('text') && texts.images[0].text !== ""){
        tj.speak("I think I can see following words: " + texts.images[0].text);
      } else { 
        tj.speak("I can't see any text.");
      }
  });
}

//CONVERSATION
//---------------------------------------------------------------------

/**
 * LISTEN
 */
function listen(){
  tj.speak("Hello, my name is " + tj.configuration.robot.name + ". I am listening...");

  tj.listen(function(msg) {
      // check to see if they are talking to TJBot
      if(msg.indexOf(tj.configuration.robot.name) > -1) { //robot's name is in the text
        // remove our name from the message
        var msgNoName = msg.toLowerCase().replace(tj.configuration.robot.name.toLowerCase(), "");

        processConversation(msgNoName, function(response){
          //read response text from the service
          if(response.description){
            tj.speak(response.description).then(function(){
              if (response.object.context.hasOwnProperty('action')){
                var cmdType = response.object.context.action.cmdType;
                var cmdPayload;
                if (response.object.context.action.hasOwnProperty('cmdPayload')) {
                  cmdPayload = response.object.context.action.cmdPayload;
                }
                processAction(cmdType, cmdPayload);
              }
            });
          }
        });
      }
  });
}

/**
 * PROCESS CONVERSATION
 * @param inTextMessage - text
 */
function processConversation(inTextMessage, callback){
  // send to the conversation service
  tj.converse(confCred.conversationWorkspaceId, inTextMessage, function(response) {
      console.log(JSON.stringify(response, null, 2));
      callback(response);
  });

}


//PROCESS ACTIONS
//---------------------------------------------------------------------
function processAction(cmd, payload) {
  switch(cmd){
    case "tjbot_reset":
      resetTJBot();
      break;
    case "take_a_photo":
      take_a_photo().then(function(){
        tj.speak("I am done. You can classify objects, detect faces or find a text now.");
      });
      break;
    case "classify_photo":
      classify_photo();
      break;
    case "read_text":
      read_text();
      break;
    case "detect_faces":
      detect_faces();
      break;
    case "photo_and_detect_faces":
      take_a_photo().then(function(){
        //this must be called in this way otherwise it takes a previous picture
        detect_faces();
      });
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

function stopListening(){
  tj.stopListening();

  var msg = "Listening was stopped.";
  tj.speak(msg);
  console.log(msg);
}

//LED
//---------------------------------------------------------------------

//helper
function led_turn_on(led){
  led.digitalWrite(1);
}
//helper
function led_turn_off(led){
  led.digitalWrite(0);
}
/**
 * helper which can change the color of the RGB led.
 *
 * @param {String} color The color to use. Must be from list of _basic_colors.
*/
function changeColorRGBLed(color, callback) {
  switch (color){
   case "red":
    led_turn_on(_RGBLed.pinR);
    led_turn_off(_RGBLed.pinG);
    led_turn_off(_RGBLed.pinB);
    break;
   case "green":
    led_turn_off(_RGBLed.pinR);
    led_turn_on(_RGBLed.pinG);
    led_turn_off(_RGBLed.pinB);
    break;
   case "blue":
    led_turn_off(_RGBLed.pinR);
    led_turn_off(_RGBLed.pinG);
    led_turn_on(_RGBLed.pinB);
    break;
   case "yellow":
    led_turn_on(_RGBLed.pinR);
    led_turn_on(_RGBLed.pinG);
    led_turn_off(_RGBLed.pinB);
    break;
   case "magenta":
    led_turn_on(_RGBLed.pinR);
    led_turn_off(_RGBLed.pinG);
    led_turn_on(_RGBLed.pinB);
    break;
   case "cyan":
    led_turn_off(_RGBLed.pinR);
    led_turn_on(_RGBLed.pinG);
    led_turn_on(_RGBLed.pinB);
    break;
   case "white":
    led_turn_on(_RGBLed.pinR);
    led_turn_on(_RGBLed.pinG);
    led_turn_on(_RGBLed.pinB);
    break;
   case "random":
    var randIdx = Math.floor(Math.random() * _basic_colors.length);
    color = _basic_colors[randIdx];
    changeColorRGBLed(color, function(color){});
    break;
   default:
    console.log("Unknowen color.");
    callback(null);
  }
  callback(color);
}

//Turns off all the RGB LED colors
//---------------------------------------------------------------------
function led_turn_off_all() {
  led_turn_off(_RGBLed.pinR);
  led_turn_off(_RGBLed.pinG);
  led_turn_off(_RGBLed.pinB);
}

//Turns on all the RGB LED on random color
//---------------------------------------------------------------------
function led_turn_on_all() {
  changeColorRGBLed("random", function(ret_color){
    if(ret_color) {
      console.log("Color is: " + ret_color);
    } else {
      console.log("Color did not set.");
    }
  });
}

//Changes the color of the RGB LED
//---------------------------------------------------------------------
function led_change_color(color){
  changeColorRGBLed(color, function(ret_color){
    if(ret_color) {
      console.log("Color is: " + ret_color);
    } else {
      console.log("Color did not set.");
    }
  });
}

//ARM
//---------------------------------------------------------------------
function wave_arm(position){
console.log("CMD: " + position);
  switch(position){
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
     position = "raised";
     break;
   default:
     tj.speak("I'm not able to set my arm into this position.");
  }
}


//RESET TJBOT
//---------------------------------------------------------------------
function resetTJBot(){
  tj.raiseArm();
  led_turn_off_all();
  tj.stopListening();
  listen();
}


//CALL INIT
//---------------------------------------------------------------------
resetTJBot();
initRestAPI();
