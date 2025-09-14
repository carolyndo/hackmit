let midiData = null;
let synths = [];
let currentlyPlayingNotes = new Set();
let noteStartTimes = new Map();
let lyrics = [];
let currentLyricIndex = -1;
let lastLeadNote = "";
let lyricBatches = []; // Store lyrics grouped into batches of 5
let currentBatchIndex = -1;
let currentSongTitle = ""; // Track the current song title


// If the glasses can't reach your laptop, set this to your ngrok HTTPS URL
const API_BASE = "https://hackmit-production.up.railway.app";

const playingCount = new Map(); // name -> count

// Choose the most recently-started MIDI note as the "lead" to display
function getLeadNote() {
  if (currentlyPlayingNotes.size === 0) return "";
  let best = "", bestT = -Infinity;
  for (const n of currentlyPlayingNotes) {
    const t = noteStartTimes.get(n) ?? -Infinity;
    if (t > bestT) { best = n; bestT = t; }
  }
  return best;
}

let currentNoteText = "";
let currentLyricText = "";

const pushNowPlaying = (() => {
  let lastNote = "", lastLyric = "", lastSongTitle = "", lastPitchCorrection = null;
  return async (note, lyric, songTitle, pitchCorrection) => {
    note = (note || "").trim();
    lyric = (lyric || "").trim();
    songTitle = (songTitle || "").trim();
    if (note === lastNote && lyric === lastLyric && songTitle === lastSongTitle && JSON.stringify(pitchCorrection) === JSON.stringify(lastPitchCorrection)) return; // dedupe
    lastNote = note; lastLyric = lyric; lastSongTitle = songTitle; lastPitchCorrection = pitchCorrection;
    console.debug("[nowplaying->API]", { note, lyric, songTitle, pitchCorrection });
    try {
      const res = await fetch(`${API_BASE}/nowplaying`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, lyric, songTitle, pitchCorrection }),
        keepalive: true,
      });
      if (!res.ok) console.error("[nowplaying] server responded", res.status);
    } catch (e) {
      console.error("[nowplaying] post failed", e);
    }
  };
})();

// Pre-loaded MIDI files functionality
const preloadedMidiFiles = {
    'TwinkleTwinkle.mid': {
        title: 'Twinkle Twinkle',
        description: 'Classic children\'s lullaby',
        path: '../midi-tracks/TwinkleTwinkle.mid'
    },
    'HereComesTheSun.mid': {
        title: 'Here Comes The Sun',
        description: 'The Beatles classic',
        path: '../midi-tracks/HereComesTheSun.mid'
    }
};

// Load pre-loaded MIDI file
async function loadPreloadedMidi(filename) {
    try {
        console.log(`Loading pre-loaded MIDI file: ${filename}`);
        
        // Show loading state
        const songCard = document.querySelector(`[data-file="${filename}"]`);
        const loadBtn = songCard.querySelector('.load-song-btn');
        loadBtn.textContent = 'Loading...';
        loadBtn.disabled = true;
        
        // Fetch the MIDI file
        const response = await fetch(preloadedMidiFiles[filename].path);
        if (!response.ok) {
            throw new Error(`Failed to load ${filename}: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        
        // Parse the MIDI file
        midiData = new Midi(arrayBuffer);
        console.log("Pre-loaded MIDI loaded:", midiData);
        
        // Set the current song title
        currentSongTitle = preloadedMidiFiles[filename].title;
        
        // Display the JSON data
        displayMidiData(midiData);
        
        // Update UI to show loaded state
        songCard.classList.add('loaded');
        loadBtn.textContent = '✓ Loaded';
        loadBtn.disabled = false;
        
        // Clear other loaded states
        document.querySelectorAll('.song-card').forEach(card => {
            if (card !== songCard) {
                card.classList.remove('loaded');
                const btn = card.querySelector('.load-song-btn');
                btn.textContent = 'Load Song';
                btn.disabled = false;
            }
        });
        
        // Update debug info
        if (typeof updateDebugInfo === 'function') {
            updateDebugInfo(`Pre-loaded MIDI file "${filename}" loaded successfully`);
        }
        
    } catch (error) {
        console.error('Error loading pre-loaded MIDI:', error);
        alert(`Failed to load ${filename}: ${error.message}`);
        
        // Reset button state
        const songCard = document.querySelector(`[data-file="${filename}"]`);
        const loadBtn = songCard.querySelector('.load-song-btn');
        loadBtn.textContent = 'Load Song';
        loadBtn.disabled = false;
    }
}

// Add event listeners for pre-loaded song buttons
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.load-song-btn').forEach(button => {
        button.addEventListener('click', function(e) {
            e.stopPropagation();
            const songCard = this.closest('.song-card');
            const filename = songCard.getAttribute('data-file');
            loadPreloadedMidi(filename);
        });
    });
    
    // Also add click listeners to song cards
    document.querySelectorAll('.song-card').forEach(card => {
        card.addEventListener('click', function() {
            const filename = this.getAttribute('data-file');
            loadPreloadedMidi(filename);
        });
    });
});

document.getElementById('midiInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();

    // Parse the MIDI file
    midiData = new Midi(arrayBuffer);
    console.log("MIDI loaded:", midiData);
    
    // Set the current song title from filename
    currentSongTitle = file.name.replace('.mid', '');
    
    // Display the JSON data
    displayMidiData(midiData);
    
    // Clear pre-loaded song states when user uploads their own file
    document.querySelectorAll('.song-card').forEach(card => {
        card.classList.remove('loaded');
        const btn = card.querySelector('.load-song-btn');
        btn.textContent = 'Load Song';
        btn.disabled = false;
    });
});

function displayMidiData(midiData) {
    const midiDataSection = document.getElementById('midiDataSection');
    const midiJsonData = document.getElementById('midiJsonData');
    
    // Extract lyrics from MIDI data
    extractLyrics(midiData);
    
    // Show the section
    midiDataSection.style.display = 'block';
    
    // Format and display the JSON data
    const formattedData = JSON.stringify(midiData, null, 2);
    midiJsonData.textContent = formattedData;
}

function extractLyrics(midiData) {
    lyrics = [];
    currentLyricIndex = -1;
    currentBatchIndex = -1;
    
    console.log("MIDI data structure:", midiData);
    console.log("Header:", midiData.header);
    console.log("Header meta:", midiData.header?.meta);
    
    // Get tempo (BPM) from MIDI data, default to 120
    const tempo = midiData.header.tempos && midiData.header.tempos.length > 0 
        ? midiData.header.tempos[0].bpm 
        : 120;
    
    // Get ticks per quarter note (ppq) - this is the correct property name
    const ticksPerQuarter = midiData.header.ppq || midiData.header.ticksPerBeat || 480;
    
    console.log("Using tempo:", tempo);
    console.log("Ticks per quarter note (ppq):", ticksPerQuarter);
    
    // Extract lyrics from header.meta array
    if (midiData.header && midiData.header.meta) {
        console.log("Found meta events:", midiData.header.meta.length);
        midiData.header.meta.forEach((metaEvent, index) => {
            console.log(`Meta event ${index}:`, metaEvent);
            if (metaEvent.type === 'lyrics') {
                // Convert ticks to seconds using actual tempo
                const timeInSeconds = (metaEvent.ticks / ticksPerQuarter) * (60 / tempo);
                lyrics.push({
                    text: metaEvent.text,
                    ticks: metaEvent.ticks,
                    time: timeInSeconds
                });
                console.log("Added lyric:", metaEvent.text, "at time:", timeInSeconds);
            }
        });
    } else {
        console.log("No meta events found or header.meta is undefined");
    }
    
    // Sort lyrics by time
    lyrics.sort((a, b) => a.time - b.time);
    
    // Create lyric batches of 5 words each
    createLyricBatches();
    
    console.log("Extracted lyrics:", lyrics);
    console.log("Created lyric batches:", lyricBatches);
}

function createLyricBatches() {
    lyricBatches = [];
    currentBatchIndex = -1;
    
    if (lyrics.length === 0) return;
    
    // Group lyrics into batches of 5
    for (let i = 0; i < lyrics.length; i += 5) {
        const batch = lyrics.slice(i, i + 5);
        const batchText = batch.map(lyric => lyric.text).join(' ');
        const batchTime = batch[0].time; // Use the time of the first lyric in the batch
        
        lyricBatches.push({
            text: batchText,
            time: batchTime,
            lyrics: batch // Keep reference to original lyrics for debugging
        });
        
        console.log(`Created batch ${lyricBatches.length - 1}: "${batchText}" at time ${batchTime}`);
    }
}

document.getElementById('playBtn').addEventListener('click', async () => {
    if (!midiData) {
        alert('Please load a MIDI file first!');
        return;
    }

    // Clear any existing synths
    synths.forEach(s => s.dispose());
    synths = [];
    currentlyPlayingNotes.clear();
    noteStartTimes.clear();
    currentLyricIndex = -1;
    currentBatchIndex = -1;

    await Tone.start(); // Required for browser autoplay policy
    
    // Reset transport to beginning
    Tone.Transport.stop();
    Tone.Transport.cancel();
    Tone.Transport.position = 0;

    // Schedule all notes using Transport
    midiData.tracks.forEach(track => {
        const synth = new Tone.PolySynth().toDestination();
        synths.push(synth);

        track.notes.forEach(note => {
            const startTime = note.time;
            const endTime = startTime + note.duration;
            
            // Schedule note start
            Tone.Transport.schedule((time) => {
            synth.triggerAttack(note.name, time, note.velocity);
            currentlyPlayingNotes.add(note.name);
            noteStartTimes.set(note.name, time);
            updateCurrentNoteDisplay();

            lastLeadNote = note.name;                         // <-- add this
            }, startTime);

            // Schedule note end
            Tone.Transport.schedule((time) => {
            synth.triggerRelease(note.name, time);
            currentlyPlayingNotes.delete(note.name);
            noteStartTimes.delete(note.name);
            updateCurrentNoteDisplay();
            }, endTime);
        });
    });

    // Schedule lyric updates
    scheduleLyricUpdates();

    // NEW: push the lead MIDI note + current lyric every 16ms while playing (~60fps)
    Tone.Transport.scheduleRepeat(() => {
    const lead = getLeadNote();
    pushNowPlaying(lead, currentLyricText, currentSongTitle, null); // No pitch correction data yet
    }, 0.016);

    // Start transport
    Tone.Transport.start();
    console.log("Playing MIDI...");
});

function updateCurrentNoteDisplay() {
  const noteDisplay = document.getElementById('currentNotes');
  if (noteDisplay) {
    if (currentlyPlayingNotes.size > 0) {
      noteDisplay.textContent = `Currently playing: ${Array.from(currentlyPlayingNotes).join(', ')}`;
    } else {
      noteDisplay.textContent = 'No notes currently playing';
    }
  }
}

function scheduleLyricUpdates() {
    console.log("Scheduling lyric batch updates. Total batches:", lyricBatches.length);
    if (lyricBatches.length === 0) {
        console.log("No lyric batches to schedule");
        return;
    }
    
    // Schedule lyric updates for each batch
    lyricBatches.forEach((batch, index) => {
        console.log(`Scheduling batch ${index}: "${batch.text}" at time ${batch.time}`);
        Tone.Transport.schedule((time) => {
            console.log(`Lyric batch scheduled event triggered for: "${batch.text}"`);
            currentBatchIndex = index;
            updateCurrentLyricDisplay();
        }, batch.time);
    });
}

function updateCurrentLyricDisplay() {
  const lyricDisplay = document.getElementById('currentLyrics');
  if (lyricDisplay) {
    if (currentBatchIndex >= 0 && currentBatchIndex < lyricBatches.length) {
      lyricDisplay.textContent = lyricBatches[currentBatchIndex].text;
      currentLyricText = lyricBatches[currentBatchIndex].text || "";
    } else {
      lyricDisplay.textContent = 'No lyrics currently playing';
      currentLyricText = "";
    }
  }
}

// Add stop button functionality
document.getElementById('stopBtn').addEventListener('click', () => {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    
    // Stop all currently playing notes
    synths.forEach(synth => {
        synth.releaseAll();
    });
    
    // Clear tracking
    currentlyPlayingNotes.clear();
    noteStartTimes.clear();
    currentLyricIndex = -1;
    currentBatchIndex = -1;
    updateCurrentNoteDisplay();
    updateCurrentLyricDisplay();

    lastLeadNote = "";                 // clear when you fully stop
    if (typeof pushNowPlaying === "function") {
    pushNowPlaying("", "", "", null);          // optional: blank out the display on stop
    }
    
    console.log("Stopped MIDI playback");
});

// Add analysis functionality
document.getElementById('analyzeBtn').addEventListener('click', () => {
    if (!midiData) {
        alert('Please load a MIDI file first!');
        return;
    }
    
    analyzeMidiStructure(midiData);
});

function analyzeMidiStructure(midiData) {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.style.display = 'block';
    
    let analysis = '<h3>MIDI Structure Analysis</h3>';
    
    analysis += `<p><strong>Duration:</strong> ${midiData.duration} seconds</p>`;
    analysis += `<p><strong>Ticks per beat:</strong> ${midiData.header.ticksPerBeat}</p>`;
    analysis += `<p><strong>Number of tracks:</strong> ${midiData.tracks.length}</p>`;
    
    midiData.tracks.forEach((track, i) => {
        analysis += `<h4>Track ${i}</h4>`;
        analysis += `<ul>`;
        analysis += `<li><strong>Name:</strong> ${track.name || 'Unnamed'}</li>`;
        analysis += `<li><strong>Instrument:</strong> ${track.instrument.name || 'Unknown'}</li>`;
        analysis += `<li><strong>Notes:</strong> ${track.notes.length}</li>`;
        analysis += `<li><strong>Control Changes:</strong> ${track.controlChanges ? Object.keys(track.controlChanges).length : 0}</li>`;
        analysis += `<li><strong>Pitch Bends:</strong> ${track.pitchBends ? track.pitchBends.length : 0}</li>`;
        
        // Check for events array
        if (track.events && track.events.length > 0) {
            analysis += `<li><strong>Events:</strong> ${track.events.length}</li>`;
            
            // Look for text events
            const textEvents = track.events.filter(event => 
                event.type === 'text' || 
                event.type === 'lyric' || 
                event.type === 'marker' ||
                event.type === 'cue' ||
                event.type === 'trackName' ||
                event.type === 'instrumentName' ||
                event.type === 'copyright' ||
                event.type === 'title' ||
                event.type === 'subtitle' ||
                event.type === 'composer' ||
                event.type === 'lyricist' ||
                event.type === 'arranger' ||
                event.type === 'performer' ||
                event.type === 'software' ||
                event.type === 'sequencer' ||
                event.type === 'comment' ||
                event.type === 'deviceName' ||
                event.type === 'programName' ||
                event.type === 'text' ||
                event.type === 'marker' ||
                event.type === 'cue' ||
                event.type === 'channelPrefix' ||
                event.type === 'portPrefix' ||
                event.type === 'endOfTrack' ||
                event.type === 'setTempo' ||
                event.type === 'smpteOffset' ||
                event.type === 'timeSignature' ||
                event.type === 'keySignature' ||
                event.type === 'sequencerSpecific' ||
                event.type === 'sysex' ||
                event.type === 'meta'
            );
            
            if (textEvents.length > 0) {
                analysis += `<li><strong>Text Events Found:</strong> ${textEvents.length}</li>`;
                textEvents.forEach((event, j) => {
                    if (j < 5) { // Show first 5 text events
                        analysis += `<li style="margin-left: 20px;">Event ${j}: ${event.type} - ${event.text || JSON.stringify(event)}</li>`;
                    }
                });
            }
        }
        
        // Check all properties of the track
        analysis += `<li><strong>All properties:</strong> ${Object.keys(track).join(', ')}</li>`;
        
        analysis += `</ul>`;
    });
    
    resultsDiv.innerHTML = analysis;
}
