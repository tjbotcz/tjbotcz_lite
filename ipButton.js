
var gpio = require("pigpio").Gpio;
var ip = require("ip");
var espeak = require("espeak");
var soundplayer = require("sound-player");
var fs = require('fs');

//get IP address as a string
var ipina = ip.address();
ipina = "My I P is.   " + ipina.toString();


//setting up button on pin 13 + GND
const button = new gpio(13, {
  mode: gpio.INPUT,
  pullUpDown: gpio.PUD_UP,
  alert: true
});

/*
Level must be stable for 10 ms before an alert event is emitted - to filter out unwanted noise from an input signal
*/
button.glitchFilter(10000);

 /*
 Listening for alert event which will return a callback with two parameters - level wchich van be high or low and tick which is a timestamp of the alert
*/

button.on('alert', function(level, tick) {
  if (level == 0) {
    console.log("Button Pressed")
    console.log(ipina)

   
    espeak.speak(ipina, ['-s 122'], function(err, wav) {
      if (err) return console.error(err);
     
      // get the raw binary wav data
      var buffer = wav.buffer;

      // save buffer to file mojeipina.wav
      let path = 'mojeipina.wav';
      fs.open(path, 'w', function(err,fd) {  
        if (err) {
            throw 'could not open file: ' + err;
          }
      
        fs.write(fd, buffer, 0, buffer.length, null, function(err) {
          if (err) throw 'error writing file: ' + err;
          fs.close(fd, function() {
              console.log('Sound file created successfully.');
          });
      });
     });
      
      // sound player playing the wav file created previously
      var options = {
      filename: "mojeipina.wav",
      gain: 100,
      debug: true,
      player: "aplay",   
      }

      var myplayer = new soundplayer(options)
      myplayer.play();

    });

    
  }
});

