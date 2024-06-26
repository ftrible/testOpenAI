// Import required modules
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const gpt = require("openai");
const fs = require('fs');
const path = require('path');
const { playSpeech } = require('./speak');
const { SpeechListener } = require('./listen');
const https = require('https');
const ffmpeg = require('fluent-ffmpeg');

// OpenAI configuration
const key = process.env.OPENAI_API_KEY;
const configuration = new gpt.Configuration({ apiKey: key });

// OpenAI API
const openai = new gpt.OpenAIApi(configuration);
const preprompt = 'I am a highly intelligent question answering bot. If you ask me a question that is rooted in truth, I will give you the answer. If you ask me a question that is nonsense, trickery, or has no clear answer, I will respond with "Unknown"';

// Express-based app
const app = express();
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'htdocs/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

//const upload = multer({ dest: 'htdocs/uploads/' });
const upload = multer({ storage: storage });

// Middleware to parse request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'htdocs' directory
app.use(express.static('htdocs'));

//server info
const hostname = '127.0.0.1';
const port = 8080;
/*
const httpsPort = 443;
const ckey = fs.readFileSync('./certs/client-key.pem');
const cert = fs.readFileSync('./certs/client-cert.pem');

const server = https.createServer({key: ckey, cert: cert }, app);

app.use((req, res, next) => {
  if (!req.secure) {
    return res.redirect('https://' + req.headers.host + req.url);
  }
  next();
})

// Start the server
// for production app.set('env','production');

app.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});
// https server
server.listen(httpsPort, function () {
    console.log(`Server running at https://${hostname}:${httpsPort}/`)
});
*/

// Debug mode not to call OpenAI API
let debug = true;

// Csv files to save history 
const logImageFile = "log.csv";
const logVariationFile = "vlog.csv";
const logQuestionFile = "qlog.csv";

// save base 64 data into a local png file
function saveToImage(fn, base64) {
    // remove spaces from name
    const localName = fn.replace(/\s+/g, '') + ".png";
    // build full name
    const fileName = path.join(__dirname, "htdocs", "uploads", localName);
    const buffer1 = Buffer.from(base64, "base64");
    fs.writeFileSync(fileName, buffer1);
    return "uploads/" + localName;
}

// Function to save key/value data to a csv file
function saveToFile(filePath, f, q, a) {
    if (!fs.existsSync(filePath)) {
        fs.appendFile(filePath, f, (error) => {
            if (error) {
                console.error('Failed to create file:', error);
            }
        });
    }
    fs.appendFile(filePath, '"' + q + '","' + a + '"\n', (error) => {
        if (error) {
            console.error('Failed to save file:', error);
        }
    });
}

// POST route to retrieve question and generate response
app.post('/', callOpenAPI());

// Get route to send question history
app.get('/history', (req, res) => {
    const csvData = [];
    fs.createReadStream(logQuestionFile)
        .pipe(csv())
        .on('data', (row) => {
            csvData.push(row);
        })
        .on('end', () => {
            res.json(csvData);
        });
});

// Get route to send image history
app.get('/imagehistory', (req, res) => {
    const csvData = [];
    fs.createReadStream(logImageFile)
        .pipe(csv())
        .on('data', (row) => {
            csvData.push(row);
        })
        .on('end', () => {
            res.json(csvData);
        });
});

// Get route to send variation history
app.get('/variationhistory', (req, res) => {
    const csvData = [];
    fs.createReadStream(logVariationFile)
        .pipe(csv())
        .on('data', (row) => {
            csvData.push(row);
        })
        .on('end', () => {
            res.json(csvData);
        });
});

// Server-side route to handle /play POST request
app.post('/play', async (req, res) => {
    const { data: question } = req.body;
    try {
        // Call the server-side playSpeech function passing the question as an argument
        const file = await playSpeech(question, debug);
        // Return the filename
        res.json({ file: file });
    } catch (error) {
        console.error('Error playing speech:', error);
        res.status(500).json({ error: 'Error playing speech' });
    }
});

// POST route to retrieve image descriptions and generate response
app.post('/image', (req, res) => {
    console.dir(req.body);
    const { data: question } = req.body;
    let answer = 'error.png';
    if (!debug) {
        // Make the API request to OpenAI
        const completion = openai.createImage({
            style: "natural", 
            quality: "hd", 
            model: req.body.model,
            prompt: question,
            n: 1,
            size: req.body.size,
            response_format: "b64_json"
            //DALL·E-3 accepts three different image sizes: 1024px by 1024px, 1792px by 1024px, and 1024px by 1792px.
        }).then((completion) => {
            answer = completion.data.data[0].b64_json;
            const name = saveToImage(question, answer);
            saveToFile(logImageFile, '"description","url"\n', question, name);
            answer = name;
            res.json({ question, answer });
        }).catch((error) => {
            console.error('OpenAI API request failed:', error);
        //  error.response.status // error.response.statusText
            res.json({ question, answer });
        });
    } else {
        // debug mode - return random image
        answer = 'debug.png';
        // wait 1 sec to answer
        setTimeout(function () {
            res.json({ question, answer });
        }, 1000);
    }
});

app.post('/listen', (req, res) => {
    const s = new SpeechListener()
        .on('transcribed', (transcript) => {
            console.log(transcript);
            res.json({ transcript });
        })
        .on('error', () => {
            console.error(error);
            res.sendStatus(500);
        });
});


app.post('/listen2', upload.single('audioFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No audio file uploaded');
      }
      const webmFilePath = req.file.path;
      const wavFilePath = webmFilePath.replace('.webm', '.wav');

      //  use ffmpeg to transform req.file webm file into a wav file using wavFile name
      // on mac: brew install ffmpeg
      ffmpeg()
      .input(webmFilePath)
      .audioFrequency(16000) // Set audio sample rate to 16 kHz
      .output(wavFilePath)
      .on('end', () => {
          const s = new SpeechListener(wavFilePath)
              .on('transcribed', (transcript) => {
                fs.unlink(webmFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting webm file:', err);
                    } else {
                        console.log('Webm file deleted');
                    }
                });
                fs.unlink(wavFilePath, (err) => {
                    if (err) {
                        console.error('Error deleting wav file:', err);
                    } else {
                        console.log('Wav file deleted');
                    }
                });
                  console.log(transcript);
                  res.json({ transcript });
              })
              .on('error', (error) => {
                  console.error(error);
                  res.sendStatus(500);
              });
      })
      .on('error', (error) => {
          console.error('FFmpeg error:', error);
          res.sendStatus(500);
      })
      .run();
});

// POST route to retrieve image descriptions and generate response
app.post('/variation', upload.single('data'), (req, res) => {
    let answer = 'error.png';
    const question = "uploads/" + req.file.filename;

    if (!debug) {
        // Make the API request to OpenAI
        const completion = openai.createImageVariation(
            fs.createReadStream(path.join(__dirname, "htdocs", question)),
            1,
            req.body.size,
            "b64_json"
        ).then((completion) => {
            answer = completion.data.data[0].b64_json;
            const name = saveToImage(req.file.filename, answer);
            saveToFile(logVariationFile, '"question","answer"\n', question, name);
            answer = name;
            res.json({ question, answer });
        }).catch((error) => {
            console.error('OpenAI API request failed:', error);
            res.json({ question, answer });
        });
    } else {
        // debug mode - return random image
        answer = 'debug.png';
        // wait 1 sec to answer
        setTimeout(function () {
            res.json({ question, answer });
        }, 1000);
    }
});
// post root to manage the debug button: React when it changes
app.post('/debug', (req, res) => {
    const { debug: ddebug } = req.body;
    debug = ddebug === true;
    res.sendStatus(200); // Respond with a success status code
});

// get root to manage the debug button : Send the current value of the debug variable
app.get('/debug', (req, res) => {
    res.json({ debug });
});

// for mocha tests
module.exports = app;
// Start the server
// for production app.set('env','production');

app.listen(port, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});

function callOpenAPI() {
    return (req, res) => {
        const { data: question } = req.body;
        executeOpenAPI(question, res);
    };
}

function executeOpenAPI(question, res) {
    let answer = 'Failed to generate a response';
    if (!debug) {
        // Make the API request to OpenAI
        const completion = openai.createChatCompletion({
            model: "gpt-4", //"gpt-3.5-turbo",
            messages: [
                {
                    "role": "system",
                    "content": preprompt
                },
                {
                    "role": "user",
                    "content": question
                }
            ],
            temperature: 0.19,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        }).then((completion) => {
            answer = completion.data.choices[0].message.content;
            playSpeech(answer, debug);
            saveToFile(logQuestionFile, '"question","answer"\n', question, answer);
            res.json({ question, answer });
        }).catch((error) => {
            console.error('OpenAI API request failed:', error.config);
            res.json({ question, answer });
        });
    } else {
        answer = "No OPENAPI Call (debug mode)";
        // wait 1 sec to answer
        setTimeout(function () {
            res.json({ question, answer });
        }, 1000);
    }
}
/*
async function getLocation() {
    const response = await fetch("https://ipapi.co/json/");
    const locationData = await response.json();
    return locationData;
  }

  async function getCurrentWeather(latitude, longitude) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=apparent_temperature`;
    const response = await fetch(url);
    const weatherData = await response.json();
    return weatherData;
  }
*/