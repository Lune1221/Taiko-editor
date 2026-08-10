import { state } from './state.js';

// audio.js 内で soundBuffers を管理
let soundBuffers = { don: null, ka: null };

export function initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();

    state.audioElement = document.createElement("audio");
    state.audioElement.addEventListener("ended", resetPlay);
}

export async function loadSoundEffects() {
    try {
        const donRes = await fetch("./assets/audio/Neiro1_Don.ogg");
        if (donRes.ok && state.audioContext) {
            soundBuffers.don = await state.audioContext.decodeAudioData(await donRes.arrayBuffer());
        }
        const kaRes = await fetch("./assets/audio/Neiro1_Ka.ogg");
        if (kaRes.ok && state.audioContext) {
            soundBuffers.ka = await state.audioContext.decodeAudioData(await kaRes.arrayBuffer());
        }
    } catch (e) {
        console.warn("効果音の読み込みに失敗しました。", e);
    }
}

export function playSound(type) {
    if (!state.audioContext || state.audioContext.state === "suspended") {
        state.audioContext.resume();
    }
    let buffer = (type === "1" || type === "3") ? soundBuffers.don : soundBuffers.ka;
    if (!buffer) return;
    try {
        const source = state.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioContext.destination);
        source.start(0);
    } catch(e) {}
}

export async function loadAudioFile(file) {
    state.audioFile = file;
    document.getElementById("audioFileName").textContent = file.name;
    const url = URL.createObjectURL(file);
    state.audioElement.src = url;
    state.audioElement.load();
}

export function togglePlay() {
    if (state.isPlaying) {
        state.isPlaying = false;
        document.getElementById("playBtn").textContent = "再生 / 停止";
        state.audioElement.pause();
        clearMeasureHighlight();
    } else {
        if (state.audioContext && state.audioContext.state === "suspended") state.audioContext.resume();
        state.isPlaying = true;
        document.getElementById("playBtn").textContent = "一時停止";
        state.audioElement.play().catch(e => console.log("再生エラー:", e));
        requestAnimationFrame(updatePlayback);
    }
}

export function resetPlay() {
    if (state.isPlaying) {
        state.isPlaying = false;
        document.getElementById("playBtn").textContent = "再生 / 停止";
    }
    state.audioElement.pause();
    state.audioElement.currentTime = 0;
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
    document.getElementById("seekBar").value = "0";
    clearMeasureHighlight();
}

function clearMeasureHighlight() {
    document.querySelectorAll(".measure-row.playing").forEach(r => r.classList.remove("playing"));
    document.querySelectorAll(".note-cell.playing-note").forEach(c => c.classList.remove("playing-note"));
}

export function updateLastPlayedNoteIndex() {
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
}

let prevActiveM = -1;
let prevActiveN = -1;

function updatePlayback() {
    if (!state.isPlaying) return;
    
    const currentTime = state.audioElement.currentTime;
    const duration = state.audioElement.duration || 0;

    if (duration > 0) {
        document.getElementById("seekBar").value = (currentTime / duration) * 100;
        document.getElementById("currentTimeDisplay").textContent = `${currentTime.toFixed(2)} / ${duration.toFixed(2)}s`;
    }

    const course = state.courses[state.currentCourse];
    let currentBpm = state.bpm;
    let accumulatedTime = -state.offset;
    let noteGlobalIndex = 0;
    
    let activeMIndex = -1;
    let activeNIndex = -1;

    for (let m = 0; m < course.measures.length; m++) {
        const bChange = course.bpmChanges.find(i => i.measure === m + 1);
        if (bChange) currentBpm = bChange.bpm;

        const mTime = (60 / currentBpm) * 4;
        const sub = course.measures[m].length;
        const stepTime = mTime / sub;

        if (currentTime >= accumulatedTime && currentTime < accumulatedTime + mTime) {
            activeMIndex = m;
        }

        for (let n = 0; n < sub; n++) {
            const noteTime = accumulatedTime + (n * stepTime);
            
            if (currentTime >= noteTime && currentTime < noteTime + stepTime) {
                activeNIndex = n;
                if (state.lastPlayedNoteIndex !== noteGlobalIndex) {
                    const v = course.measures[m][n];
                    if (v >= 1 && v <= 4) playSound(v.toString());
                    state.lastPlayedNoteIndex = noteGlobalIndex;
                }
            }
            noteGlobalIndex++;
        }
        accumulatedTime += mTime;
    }

    if (activeMIndex !== -1 && activeMIndex !== state.lastActiveMIndex) {
        state.lastActiveMIndex = activeMIndex;
        const targetMIndex = Math.max(0, activeMIndex - 1);
        const targetRow = document.querySelector(`.measure-row[data-measure-index="${targetMIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    if (prevActiveM !== activeMIndex || prevActiveN !== activeNIndex) {
        if (prevActiveM !== -1) {
            const prevRow = document.querySelector(`.measure-row[data-measure-index="${prevActiveM}"]`);
            if (prevRow) {
                if (prevActiveM !== activeMIndex) prevRow.classList.remove("playing");
                if (prevActiveN !== -1) {
                    const prevCell = prevRow.querySelector(`.note-cell[data-note-index="${prevActiveN}"]`);
                    if (prevCell) prevCell.classList.remove("playing-note");
                }
            }
        }

        if (activeMIndex !== -1) {
            const curRow = document.querySelector(`.measure-row[data-measure-index="${activeMIndex}"]`);
            if (curRow) {
                curRow.classList.add("playing");
                if (activeNIndex !== -1) {
                    const curCell = curRow.querySelector(`.note-cell[data-note-index="${activeNIndex}"]`);
                    if (curCell) curCell.classList.add("playing-note");
                }
            }
        }

        prevActiveM = activeMIndex;
        prevActiveN = activeNIndex;
    }

    requestAnimationFrame(updatePlayback);
}
