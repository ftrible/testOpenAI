// document elements used
const submitButton = document.getElementById('submitButton');
const qform = document.getElementById('formQuestion');
const qtext = document.getElementById('question');
const iform = document.getElementById('formImage');
const vform = document.getElementById('formVariation');
const history = document.getElementById('history');
const message = document.getElementById('message');
const pagination = document.getElementById('pagination');
const mike = document.getElementById('microphoneIcon');
let tableData = [];
const itemsPerPage = 5;
let currentMusic = null;

// Function to enable options
function enableOptions(options) {
  let first=true;
  options.forEach(option => {
    document.getElementById(option).disabled=false;
    if (first) {
      document.getElementById(option).checked=true;
      first=false;
    }
  });
}

// Function to disable options
function disableOptions(options) {
  options.forEach(option => {
    document.getElementById(option).disabled=true;
    document.getElementById(option).checked=false;
  });
}

function renderTable(pageNumber) {
  const startIndex = (pageNumber - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Clear existing table content
  history.innerHTML = '';

  // Render table rows for the current page
  for (let i = startIndex; i < endIndex && i < tableData.length; i++) {
    createRow(tableData[i].description, tableData[i].url);
  }
}

function renderPagination() {
  const totalPages = Math.ceil(tableData.length / itemsPerPage);

  // Clear existing pagination buttons
  pagination.innerHTML = '';

  // Render pagination buttons
  if (totalPages > 1) for (let i = 1; i <= totalPages; i++) {
    const button = document.createElement('button');
    button.classList.add('pagination');
    button.textContent = "Page " + i;
    button.addEventListener('click', () => {
      renderTable(i);
    });
    pagination.appendChild(button);
  }
}

let path = '/';
let form = qform;

if (iform) { // Image page
  path = "/image";
  form = iform;
}
if (vform) { // Image page
  path = "/variation";
  form = vform;
}
function addRow(description, url) {
  tableData.unshift({ description, url });
  //  createRow(a,b);
}

// retrieve history
fetch(path + "history")
  .then((response) => response.json())
  .then((data) => {
    data.forEach((row) => {
      //      console.log(row);
      if (iform) {
        addRow(row.description, row.url);
      } else {
        addRow(row.question, row.answer);
      }
    });
    renderTable(1);
    renderPagination();
  });

const soundButton = '<button type="button">&#x1F508;</button>';

function createRow(question, answer) {
  const newRow = document.createElement('tr');
  const newQCell = document.createElement('td');
  if (vform) {
    const img = document.createElement('img');
    img.src = question;
    img.height = 64;
    img.classList.add('image-hover');
    newQCell.appendChild(img);
  } else {
    newQCell.textContent = question;
  }
  newRow.appendChild(newQCell);
  if (!vform) {
    const newmCell = document.createElement('td')
    const speakerButton = createSoundButton(question);
    newmCell.appendChild(speakerButton);
    newRow.appendChild(newmCell);
  }
  const newACell = document.createElement('td');
  if (iform || vform) {
    const img = document.createElement('img');
    img.src = answer;
    img.height = 64;
    img.classList.add('image-hover');
    newACell.appendChild(img);
  } else {
    newACell.textContent = answer;
  }
  newRow.appendChild(newACell);
  if (!vform && !iform) {
    const newmCell = document.createElement('td')
    const speakerButton = createSoundButton(answer);
    newmCell.appendChild(speakerButton);
    newRow.appendChild(newmCell);
  }
  history.appendChild(newRow);
}

// Manage submit
form.addEventListener('submit', (event) => {
  event.preventDefault();
  document.body.style.cursor = 'progress';
  message.style.display = 'block';
  message.textContent = "Computing...";
  submitButton.disabled = true;
  let formData = new FormData(event.target);
  if (qform || iform) formData = new URLSearchParams(formData);

  fetch(path, {
    method: 'POST',
    body: formData
  })
    .then((response) => response.json())
    .then((data) => {
      //     console.log(data);
      addRow(data.question, data.answer);
      renderTable(1);
      renderPagination();
      form.reset();
      document.body.style.cursor = 'default';
      message.style.display = 'none';
      submitButton.disabled = false;
    }).catch((error) => {
      console.log(error);
      document.body.style.cursor = 'default';
      message.textContent = "Error";
      setTimeout(function () {
        message.style.display = 'none';
      }, 1000);
      submitButton.disabled = false;
    });
});

/* Event listener for the microphone icon click
mike.addEventListener('click', async function () {
  mike.disabled = true;
  try {
    // Make an API request to the server-side analyzeSpeech function
   const response = await fetch('/listen', {
      method: 'POST'
    });
    // Handle the response as needed
    if (response.ok) {
      console.log('ok');
      const data = await response.json();
      qtext.value = data.transcript;
      mike.disabled = false;
    } else {
      console.error('Error analyzing speech:', response.statusText);
      mike.disabled = false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    mike.disabled = false;
    document.body.style.cursor = 'default';
  }

});*/

let isRecording = false;
let audioChunks = [];

// Attach click event listener to the 'mike' button
mike.addEventListener('mousedown', startRecording);
mike.addEventListener('mouseup', stopRecordingAndUpload);
// Get the form and radio buttons
if (iform) {
  const modelRadio = iform.elements['model'];
  const sizeRadio = iform.elements['size'];

  // Add change event listener to the form
  form.addEventListener('change', function () {
    // Check the selected model
    const selectedModel = modelRadio.value;

    // Show or hide size options based on the selected model
    if (selectedModel === 'dall-e-2') {
      enableOptions(['256', '512', '1024']);
      disableOptions(['1792H', '1792V']);
    } else if (selectedModel === 'dall-e-3') {
      enableOptions(['1024', '1792H', '1792V']);
      disableOptions(['256', '512']);
    }
  });
}
let mediaRecorder = null;
// Function to start recording audio
async function startRecording() {
  mike.classList.add('recording');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  isRecording = true;
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      console.log("chunk " + event.data.size);
      audioChunks.push(event.data);
    }
  };

  mediaRecorder.start();
}

// Function to stop recording and upload audio
async function stopRecordingAndUpload() {
  if (isRecording) {
    isRecording = false;
    mike.classList.remove('recording');
    //  const mediaRecorder = audioChunks[0].recorder;
    mediaRecorder.stop();

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audioFile', audioBlob, 'audio.webm');

      try {
        document.body.style.cursor = 'progress';
        const response = await fetch('/listen2', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          console.log('Audio uploaded successfully');
          const data = await response.json();
          qtext.value = data.transcript;
        } else {
          console.error('Error uploading audio:', response.statusText);
        }
        mediaRecorder = null;
        document.body.style.cursor = 'default';
      } catch (error) {
        console.error('Error:', error);
        document.body.style.cursor = 'default';
      }

      audioChunks = [];
    };
  }
}


function createSoundButton(question) {
  const speakerButton = document.createElement('button');
  speakerButton.type = 'button';
  speakerButton.innerHTML = '&#x1F508;';
  speakerButton.addEventListener('click', playSound(speakerButton, question));
  return speakerButton;
}

function playMusic(button) {
  // Check if there is a currently playing music
  if (currentMusic) {
    // Pause the current music
    currentMusic.pause();
  }
  // Create a new audio element for the new music
  const music = new Audio(button.audioURL);
  music.playbackRate = 1.2;
  music.addEventListener('ended', endMusic());
  music.addEventListener('pause', endMusic());
  // Store the reference to the new music in the currentMusic variable
  currentMusic = music;
  // Play the new music
  music.play();
  // disable the button
  button.disabled = true;

  function endMusic() {
    return () => {
      currentMusic = null; // Reset currentMusic reference when the music ends
      button.disabled = false; // Enable the button
      console.log("enable");
    };
  }
}

function playSound(button, question) {
  return async function () {
    if (button.audioURL) {
      console.log('Play old file', button.audioURL);
      playMusic(button);
    } else try {
      button.disabled = true;
      document.body.style.cursor = 'progress';
      // Make an API request to the server-side playSpeech function
      const response = await fetch('/play', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: question })
      });
      // Handle the response as needed
      if (response.ok) {
        const data = await response.json();
        button.audioURL = data.file;
        console.log('Play new file', button.audioURL);
        playMusic(button);
      } else {
        console.error('Error generating speech:', response.statusText);
        button.disabled = false;
      }
    } catch (error) {
      console.error('Error:', error.message);
      button.disabled = false;
    } finally {
      document.body.style.cursor = 'default';
    }
  };
}

