let midiData = null;
let synths = [];
let currentlyPlayingNotes = new Set();
let noteStartTimes = new Map();
let lyrics = [];
let currentLyricIndex = -1;

document.getElementById('midiInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const arrayBuffer = await file.arrayBuffer();

    // Parse the MIDI file
    midiData = new Midi(arrayBuffer);
    console.log("MIDI loaded:", midiData);
    
    // Display the JSON data
    displayMidiData(midiData);
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
    
    console.log("Extracted lyrics:", lyrics);
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
    console.log("Scheduling lyric updates. Total lyrics:", lyrics.length);
    if (lyrics.length === 0) {
        console.log("No lyrics to schedule");
        return;
    }
    
    // Schedule lyric updates for each lyric
    lyrics.forEach((lyric, index) => {
        console.log(`Scheduling lyric ${index}: "${lyric.text}" at time ${lyric.time}`);
        Tone.Transport.schedule((time) => {
            console.log(`Lyric scheduled event triggered for: "${lyric.text}"`);
            currentLyricIndex = index;
            updateCurrentLyricDisplay();
        }, lyric.time);
    });
}

function updateCurrentLyricDisplay() {
    const lyricDisplay = document.getElementById('currentLyrics');
    console.log("Updating lyric display. Current index:", currentLyricIndex, "Total lyrics:", lyrics.length);
    if (lyricDisplay) {
        if (currentLyricIndex >= 0 && currentLyricIndex < lyrics.length) {
            console.log("Showing lyric:", lyrics[currentLyricIndex].text);
            lyricDisplay.textContent = lyrics[currentLyricIndex].text;
        } else {
            console.log("No lyric to show");
            lyricDisplay.textContent = 'No lyrics currently playing';
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
    updateCurrentNoteDisplay();
    updateCurrentLyricDisplay();
    
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
