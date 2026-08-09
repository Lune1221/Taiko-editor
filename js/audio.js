import { state, soundBuffers } from './state.js';

let lastHighlightedRow = null;
let lastHighlightedCell = null;
let lastRendaSoundTime = 0;
let activeBalloonData = null;
let playedBalloonPopKeys = new Set();

export function initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
}

export async function loadSoundEffects() {
    try {
        const donRes = await fetch("assets/audio/Neiro1_Don.ogg");
        if (donRes.ok) soundBuffers.don = await state.audioContext.decodeAudioData(await donRes.arrayBuffer());
        const kaRes = await fetch("assets/audio/Neiro1_Ka.ogg");
        if (kaRes.ok) soundBuffers.ka = await state.audioContext.decodeAudioData(await kaRes.arrayBuffer());
        const balloonRes = await fetch("assets/audio/se_balloon.ogg");
        if (balloonRes.ok) soundBuffers.balloon = await state.audioContext.decodeAudioData(await balloonRes.arrayBuffer());
    } catch (e) {
        console.warn("効果音の読み込みに失敗しました。");
    }
}

export function playSound(type) {
    if (!state.audioContext || state.audioContext.state === "suspended") state.audioContext.resume();
    let buffer = null;
    if (type === "1" || type === "3") buffer = soundBuffers.don;
    else if (type === "2" || type === "4") buffer = soundBuffers.ka;
    else if (type === "balloon") buffer = soundBuffers.balloon;
    
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
    try {
        state.audioBuffer = await state.audioContext.decodeAudioData(await file.arrayBuffer());
    } catch (err) {}
}

export function togglePlay() {
    if (state.isPlaying) {
        state.isPlaying = false;
        document.getElementById("playBtn").textContent = "再生 / 停止";
        if (state.audioSource) try { state.audioSource.stop(); } catch(e) {}
        if (state.audioBuffer) {
            state.playbackTime = state.audioContext.currentTime - state.startTime;
            if (state.playbackTime < 0) state.playbackTime = 0;
        }
        clearMeasureHighlight();
    } else {
        if (state.audioContext.state === "suspended") state.audioContext.resume();
        state.isPlaying = true;
        document.getElementById("playBtn").textContent = "一時停止";
        if (state.audioBuffer) {
            if (state.audioSource) try { state.audioSource.stop(); } catch(e) {}
            state.audioSource = state.audioContext.createBufferSource();
            state.audioSource.buffer = state.audioBuffer;
            state.audioSource.connect(state.audioContext.destination);
            state.audioSource.start(0, Math.max(0, state.playbackTime));
        }
        state.startTime = state.audioContext.currentTime - state.playbackTime;
        requestAnimationFrame(updatePlayback);
    }
}

export function resetPlay() {
    if (state.isPlaying) togglePlay();
    state.playbackTime = 0;
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
    lastRendaSoundTime = 0;
    activeBalloonData = null;
    playedBalloonPopKeys.clear();
    document.getElementById("seekBar").value = "0";
    clearMeasureHighlight();
}

export function clearMeasureHighlight() {
    if (lastHighlightedRow) lastHighlightedRow.classList.remove("playing");
    if (lastHighlightedCell) lastHighlightedCell.classList.remove("playing-note");
    lastHighlightedRow = null;
    lastHighlightedCell = null;
    document.querySelectorAll(".measure-row").forEach(r => r.classList.remove("playing"));
    document.querySelectorAll(".note-cell.playing-note").forEach(c => c.classList.remove("playing-note"));
}

export function updateLastPlayedNoteIndex() {
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
    lastRendaSoundTime = 0;
    activeBalloonData = null;
    playedBalloonPopKeys.clear();
}

export function updatePlayback() {
    if (!state.isPlaying) return;
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;

    if (duration > 0) {
        if (duration > 0 && state.playbackTime >= duration) { resetPlay(); return; }
        document.getElementById("seekBar").value = (state.playbackTime / duration) * 100;
        document.getElementById("currentTimeDisplay").textContent = `${state.playbackTime.toFixed(2)} / ${duration.toFixed(2)}s`;
    }

    const course = state.courses[state.currentCourse];
    let currentBpm = state.bpm;
    let noteGlobalIndex = 0;
    
    let activeMIndex = -1;
    let activeNIndex = -1;
    let isCurrentlyInRenda = false;

    let scanBpm = state.bpm;
    let scanTime = -state.offset;
    let currentRendaStart = -1;
    let foundBalloonThisFrame = null;

    for (let m = 0; m < course.measures.length; m++) {
        const bChange = course.bpmChanges.find(i => i.measure === m + 1);
        if (bChange) scanBpm = bChange.bpm;
        const mTime = (60 / scanBpm) * 4;
        const sub = course.measures[m].length;
        const stepTime = mTime / sub;

        for (let n = 0; n < sub; n++) {
            const noteTime = scanTime + (n * stepTime);
            const val = course.measures[m][n];

            if (val === 5 || val === 6) {
                currentRendaStart = noteTime;
            } else if (val === 8 && currentRendaStart !== -1) {
                if (state.playbackTime >= currentRendaStart && state.playbackTime <= noteTime) {
                    isCurrentlyInRenda = true;
                }
                currentRendaStart = -1;
            } else if (val === 7) {
                const countKey = `${m}-${n}`;
                const balloonCount = course.balloonCounts[countKey] !== undefined ? course.balloonCounts[countKey] : 5;
                
                let balloonEndTime = noteTime + 1.0;
                let foundEnd = false;
                let sm = m, sn = n + 1;
                let searchLimit = 0;
                while (sm < course.measures.length && searchLimit < 100) {
                    while (sn < course.measures[sm].length) {
                        let nextVal = course.measures[sm][sn];
                        if (nextVal === 8 || nextVal > 0) {
                            let tempBpm = scanBpm;
                            let tempTime = -state.offset;
                            let targetTimeAcc = 0;
                            for (let tm = 0; tm <= sm; tm++) {
                                let tBChange = course.bpmChanges.find(i => i.measure === tm + 1);
                                if (tBChange) tempBpm = tBChange.bpm;
                                let tmTime = (60 / tempBpm) * 4;
                                let tSub = course.measures[tm].length;
                                let tStep = tmTime / tSub;
                                for (let tn = 0; tn < tSub; tn++) {
                                    if (tm === sm && tn === sn) {
                                        targetTimeAcc = tempTime + (tn * tStep);
                                        foundEnd = true;
                                        break;
                                    }
                                }
                                if (foundEnd) break;
                                tempTime += tmTime;
                            }
                            if (foundEnd) {
                                balloonEndTime = targetTimeAcc;
                            }
                            break;
                        }
                        sn++;
                        searchLimit++;
                    }
                    if (foundEnd) break;
                    sm++;
                    sn = 0;
                }

                let balloonDuration = Math.max(0.2, balloonEndTime - noteTime);
                let balloonStartActive = noteTime + 0.02;

                if (state.playbackTime >= balloonStartActive && state.playbackTime <= noteTime + balloonDuration) {
                    isCurrentlyInRenda = true;
                    let interval = balloonDuration / Math.max(1, balloonCount);
                    foundBalloonThisFrame = {
                        key: countKey,
                        interval: interval,
                        startTime: balloonStartActive,
                        endTime: noteTime + balloonDuration
                    };
                } else if (state.playbackTime > noteTime + balloonDuration) {
                    if (state.playbackTime <= noteTime + balloonDuration + 0.1) {
                        if (!playedBalloonPopKeys.has(countKey)) {
                            playSound("balloon");
                            playedBalloonPopKeys.add(countKey);
                        }
                    }
                }
            }
            noteGlobalIndex++;
        }
        scanTime += mTime;
    }

    if (foundBalloonThisFrame) {
        if (!activeBalloonData || activeBalloonData.key !== foundBalloonThisFrame.key) {
            activeBalloonData = foundBalloonThisFrame;
            lastRendaSoundTime = activeBalloonData.startTime;
        }

        if (state.playbackTime - lastRendaSoundTime >= activeBalloonData.interval) {
            playSound("1");
            lastRendaSoundTime += activeBalloonData.interval;
        }
    } else {
        activeBalloonData = null;
        if (!isCurrentlyInRenda) {
            lastRendaSoundTime = 0;
        }
    }

    if (isCurrentlyInRenda && !foundBalloonThisFrame) {
        if (state.playbackTime - lastRendaSoundTime >= 0.11) {
            playSound("1");
            lastRendaSoundTime = state.playbackTime;
        }
    }

    noteGlobalIndex = 0;
    let accumulatedTime = -state.offset;
    for (let m = 0; m < course.measures.length; m++) {
        const bChange = course.bpmChanges.find(i => i.measure === m + 1);
        if (bChange) currentBpm = bChange.bpm;

        const mTime = (60 / currentBpm) * 4;
        const sub = course.measures[m].length;
        const stepTime = mTime / sub;

        if (state.playbackTime >= accumulatedTime && state.playbackTime < accumulatedTime + mTime) {
            activeMIndex = m;
        }

        for (let n = 0; n < sub; n++) {
            const noteTime = accumulatedTime + (n * stepTime);
            const val = course.measures[m][n];

            if (state.playbackTime >= noteTime && state.playbackTime < noteTime + stepTime) {
                activeNIndex = n;
                if (state.lastPlayedNoteIndex !== noteGlobalIndex) {
                    if (val >= 1 && val <= 4) {
                        playSound(val.toString());
                    } else if (val === 7) {
                        playSound("1");
                    }
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

    const curRow = activeMIndex !== -1 ? document.querySelector(`.measure-row[data-measure-index="${activeMIndex}"]`) : null;
    const curCell = (curRow && activeNIndex !== -1) ? curRow.querySelector(`.note-cell[data-note-index="${activeNIndex}"]`) : null;

    if (lastHighlightedRow && lastHighlightedRow !== curRow) {
        lastHighlightedRow.classList.remove("playing");
    }
    if (lastHighlightedCell && lastHighlightedCell !== curCell) {
        lastHighlightedCell.classList.remove("playing-note");
    }

    if (curRow) {
        curRow.classList.add("playing");
        lastHighlightedRow = curRow;
    }

    if (curCell && activeMIndex !== -1 && course.measures[activeMIndex][activeNIndex] !== 0) {
        curCell.classList.add("playing-note");
        lastHighlightedCell = curCell;
    } else {
        lastHighlightedCell = null;
    }

    requestAnimationFrame(updatePlayback);
}
