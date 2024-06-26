const path =require('node:path');
const { spawn } =require('node:child_process')
const { Buffer } =require('node:buffer')
const { SpeechRecorder } =require( 'speech-recorder')
const { WaveFile } =require( 'wavefile')
const { EventEmitter } =require('node:events');
const fs = require('fs');

const binPath = path.join(__dirname, 'bin')
const soxPath = path.join(binPath, 'sox')
const whisperPath = path.join(binPath, 'whisper')
const smallModelPath = path.join(binPath, 'ggml-small.bin')

const sampleRate = 16000
const samplesPerFrame = 480

function execAsync(command, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'inherit'] })
    child.stdin.write(stdin)
    child.stdin.end()
    child.stdin.on('error', err => reject(err))
    const chunks = []
    child.stdout.on('error', err => reject(err))
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stdout.on('end', () => resolve(Buffer.concat(chunks).toString()))
    child.on('error', err => reject(err))
    child.on('exit', (code => {
      if (code !== 0)
        reject(new Error(`"${command}" process exited with code ${code}`))
    }))
  })
}


class SpeechListener extends EventEmitter {

  constructor(audioFilePath) {
    super()
    let buffer2 = []
    //const speaking = false
    
    if (audioFilePath !== undefined) {
      console.log(audioFilePath);
      // Read the audio data
      const audio = fs.readFileSync(audioFilePath);
      /* Create a new WaveFile instance
      const wav = new WaveFile(); 
      // Set audio parameters
      wav.fromScratch(1, 16000, '16', audioData);
      const audio = wav.toBuffer();*/
      const time1 = Date.now();
      execAsync(`${soxPath} -t wav - -t wav - tempo 0.8 | ${whisperPath} -m ${smallModelPath} - -l fr -nt -t 6`, audio)
            .then((transcript) => {
              const time2 = Date.now()
              console.log(`Transcript created in ${time2 - time1}ms : ${transcript}`)
              this.emit('transcribed', transcript)
              // Delete the temporary uploaded file
              // fs.unlinkSync(audioFilePath);
            })
            .catch((error) => {
              this.emit('error', error)
            })
      
    } else {
    console.log("here");
      this._recorder = new SpeechRecorder({
        consecutiveFramesForSilence: 7,
        sampleRate,
        samplesPerFrame,
        onChunkStart: ({ audio }) => {
          buffer2 = []
          audio.forEach(sample => buffer2.push(sample))
        },
        onAudio: ({ speaking, probability, speech, volume, audio, consecutiveSilence }) => {
          if (speaking)
            audio.forEach(sample => buffer2.push(sample))
        },
        onChunkEnd: async () => {
          console.log("async" + buffer2.length);
          if (buffer2.length < samplesPerFrame * 20)
            return
          this._recorder.stop()
          const time0 = Date.now()
          const wav = new WaveFile()
          wav.fromScratch(1, 16000, '16', buffer2)
          const audio = wav.toBuffer()
          const time1 = Date.now()
          console.log(`Wav created in ${time1 - time0}ms`)

          execAsync(`${soxPath} -t wav - -t wav - tempo 0.8 | ${whisperPath} -m ${smallModelPath} - -l fr -nt -t 6`, audio)
            .then((transcript) => {
              const time2 = Date.now()
              console.log(`Transcript created in ${time2 - time1}ms : ${transcript}`)
              this.emit('transcribed', transcript)
            })
            .catch((error) => {
              this.emit('error', error)
            })
        },
      })
      console.log('Recording...')
      this._recorder.start()
   }
  }

  stop() {
    console.log('Stopping...')
    this._recorder.stop()
  }
}

module.exports = { SpeechListener };