const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    subdivision: 16,
    currentCourse: "oni",
    courses: {
        easy: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [] },
        normal: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [] },
        hard: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [] },
        oni: { exists: true, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [] },
        edit: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [] }
    },
    selectedTool: "1",
    audioFile: null,
    audioBuffer: null,
    isPlaying: false,
    startTime: 0,
    audioContext: null,
    audioSource: null,
    playbackTime: 0,
    lastPlayedNoteIndex: -1,
    lastActiveMIndex: -1
};

let soundBuffers = { don: null, ka: null, balloon: null };

window.addEventListener("DOMContentLoaded", () => {
    initAudioContext();
    loadSoundEffects();
    setupEventListeners();
    updateUIFromState();
});

function initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
}

async function loadSoundEffects() {
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

function playSound(type) {
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

function setupEventListeners() {
    document.addEventListener("pointerdown", () => {
        if (state.audioContext && state.audioContext.state === "suspended") state.audioContext.resume();
    }, { once: true });

    document.getElementById("metaTitle").addEventListener("input", (e) => state.title = e.target.value);
    document.getElementById("metaBpm").addEventListener("change", (e) => state.bpm = parseFloat(e.target.value) || 120);
    document.getElementById("metaOffset").addEventListener("input", (e) => state.offset = parseFloat(e.target.value) || 0);

    document.getElementById("addMeasureBtn").addEventListener("click", () => {
        const course = state.courses[state.currentCourse];
        course.exists = true;
        course.measures.push(Array(state.subdivision).fill(0));
        updateUIFromState();
    });

    document.getElementById("jumpMeasureBtn").addEventListener("click", () => {
        const m = parseInt(document.getElementById("jumpMeasureInput").value);
        if(m > 0) {
            const targetRow = document.querySelector(`.measure-row[data-measure-index="${m - 1}"]`);
            if(targetRow) {
                targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetRow.style.transition = 'background-color 0.5s';
                targetRow.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                setTimeout(() => targetRow.style.backgroundColor = '', 1000);
            }
        }
    });

    document.getElementById("subdivisionSelect").addEventListener("change", (e) => {
        state.subdivision = parseInt(e.target.value);
    });

    document.querySelectorAll(".course-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            state.currentCourse = tab.getAttribute("data-course");
            if (!state.courses[state.currentCourse].measures || state.courses[state.currentCourse].measures.length === 0) {
                state.courses[state.currentCourse].measures = [Array(state.subdivision).fill(0)];
            }
            updateUIFromState();
        });
    });

    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedTool = btn.getAttribute("data-note");
        });
    });

    document.getElementById("audioFile").addEventListener("change", async (e) => {
        if (e.target.files[0]) await loadAudioFile(e.target.files[0]);
    });

    document.getElementById("importZip").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            let tjaText = "";
            let audioFileObj = null;

            for (let filename of Object.keys(zipContent.files)) {
                if (filename.endsWith(".tja")) {
                    tjaText = await zipContent.files[filename].async("text");
                } else if (filename.match(/\.(ogg|mp3|wav)$/i)) {
                    const blob = await zipContent.files[filename].async("blob");
                    audioFileObj = new File([blob], filename, { type: blob.type });
                }
            }
            if (tjaText) parseTJA(tjaText);
            if (audioFileObj) await loadAudioFile(audioFileObj);
            
            document.getElementById("metaTitle").value = state.title;
            document.getElementById("metaBpm").value = state.bpm;
            document.getElementById("metaOffset").value = state.offset;
            updateUIFromState();
        } catch (err) {
            alert("エラー: ZIPファイルの解析に失敗しました。");
        }
        e.target.value = "";
    });

    document.getElementById("playBtn").addEventListener("click", togglePlay);
    document.getElementById("stopBtn").addEventListener("click", resetPlay);
    document.getElementById("downloadBtn").addEventListener("click", downloadZip);

    const seekBar = document.getElementById("seekBar");
    seekBar.addEventListener("input", (e) => {
        if (!state.audioBuffer) return;
        state.playbackTime = (parseFloat(e.target.value) / 100) * state.audioBuffer.duration;
        
        if (state.isPlaying) {
            if (state.audioSource) try { state.audioSource.stop(); } catch(e) {}
            state.audioSource = state.audioContext.createBufferSource();
            state.audioSource.buffer = state.audioBuffer;
            state.audioSource.connect(state.audioContext.destination);
            state.audioSource.start(0, state.playbackTime);
            state.startTime = state.audioContext.currentTime - state.playbackTime;
        }
        updateLastPlayedNoteIndex();
    });
}

async function loadAudioFile(file) {
    state.audioFile = file;
    document.getElementById("audioFileName").textContent = file.name;
    try {
        state.audioBuffer = await state.audioContext.decodeAudioData(await file.arrayBuffer());
    } catch (err) {}
}

function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    const courseMap = { "0": "easy", "EASY": "easy", "1": "normal", "NORMAL": "normal", "2": "hard", "HARD": "hard", "3": "oni", "ONI": "oni", "4": "edit", "EDIT": "edit" };
    
    let activeCourse = "oni";
    let inCourse = false;
    let measureBuffer = "";
    let balloonList = [];

    Object.keys(state.courses).forEach(k => { 
        state.courses[k].measures = []; 
        state.courses[k].balloonCounts = {}; 
        state.courses[k].bpmChanges = []; 
        state.courses[k].exists = false; 
    });

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("//")) continue;

        if (line.toUpperCase().startsWith("#BALLOON")) {
            const parts = line.split(/[ ,]+/);
            parts.shift();
            balloonList = parts.map(p => parseInt(p)).filter(p => !isNaN(p));
            continue;
        }

        if (line.includes(":") && !inCourse) {
            const [key, ...valArr] = line.split(":");
            const val = valArr.join(":").trim();
            const k = key.trim().toUpperCase();
            if (k === "TITLE") state.title = val;
            if (k === "BPM") state.bpm = parseFloat(val) || 120;
            if (k === "OFFSET") state.offset = parseFloat(val) || 0;
            if (k === "COURSE" && courseMap[val.toUpperCase()]) activeCourse = courseMap[val.toUpperCase()];
        }

        if (line.toUpperCase() === "#START") { 
            inCourse = true; 
            measureBuffer = ""; 
            balloonList = [];
            continue; 
        }
        if (line.toUpperCase() === "#END") { 
            inCourse = false; 
            if (state.courses[activeCourse].measures.length === 0) state.courses[activeCourse].measures.push([0]);
            state.courses[activeCourse].exists = true;
            continue; 
        }

        if (inCourse) {
            if (line.startsWith("#BPMCHANGE")) {
                const b = parseFloat(line.split(" ")[1]);
                if (!isNaN(b)) state.courses[activeCourse].bpmChanges.push({ measure: state.courses[activeCourse].measures.length + 1, bpm: b });
                continue;
            }
            if (line.startsWith("#")) continue;

            for (let char of line) {
                if (char === ",") {
                    let notes = [];
                    for (let c of measureBuffer) if (/[0-9]/.test(c)) notes.push(parseInt(c));
                    
                    const mIdx = state.courses[activeCourse].measures.length;
                    state.courses[activeCourse].measures.push(notes.length > 0 ? notes : [0]);

                    notes.forEach((n, nIdx) => {
                        if (n === 7 && balloonList.length > 0) {
                            state.courses[activeCourse].balloonCounts[`${mIdx}-${nIdx}`] = balloonList.shift();
                        }
                    });

                    measureBuffer = "";
                } else {
                    measureBuffer += char;
                }
            }
        }
    }

    const firstCourse = Object.keys(state.courses).find(k => state.courses[k].exists);
    if(firstCourse) state.currentCourse = firstCourse;
}

function updateUIFromState() {
    document.querySelectorAll(".course-tab").forEach(tab => {
        const k = tab.getAttribute("data-course");
        tab.classList.toggle("has-data", state.courses[k].exists);
        tab.classList.toggle("active", k === state.currentCourse);
    });
    
    const container = document.getElementById("measuresContainer");
    container.innerHTML = "";
    const course = state.courses[state.currentCourse];
    const measures = course.measures;

    let flatNotes = [];
    measures.forEach((measure, mIndex) => {
        measure.forEach((note, nIndex) => {
            flatNotes.push({ mIndex, nIndex, note });
        });
    });

    let pendingStarts = [];

    flatNotes.forEach((item, idx) => {
        if (item.note === 5 || item.note === 6) {
            pendingStarts.push({ type: 'renda', flatIdx: idx });
        } else if (item.note === 7) {
            pendingStarts.push({ type: 'balloon', flatIdx: idx });
        } else if (item.note === 8) {
            if (pendingStarts.length > 0) {
                let start = pendingStarts.shift();
                flatNotes[start.flatIdx].status = `${start.type}-start`;
                flatNotes[idx].status = `${start.type}-end`;
                for (let i = start.flatIdx + 1; i < idx; i++) {
                    if (!flatNotes[i].status) {
                        flatNotes[i].status = start.type === 'balloon' ? 'balloon-body' : 'renda-body';
                    }
                }
            }
        }
    });

    let noteStatusMap = {};
    let balloonEndpointMap = {};

    flatNotes.forEach(item => {
        if (item.status) {
            noteStatusMap[`${item.mIndex}-${item.nIndex}`] = item.status;
        }
    });

    let activeBalloonStarts = [];
    flatNotes.forEach((item, idx) => {
        if (item.note === 7) {
            activeBalloonStarts.push(idx);
        } else if (item.note === 8 && activeBalloonStarts.length > 0) {
            let startIdx = activeBalloonStarts.shift();
            let startItem = flatNotes[startIdx];
            if (startIdx + 1 < flatNotes.length) {
                let neighbor = flatNotes[startIdx + 1];
                noteStatusMap[`${startItem.mIndex}-${startItem.nIndex}`] = 'balloon-left';
                noteStatusMap[`${neighbor.mIndex}-${neighbor.nIndex}`] = 'balloon-right';
            }
            balloonEndpointMap[`${item.mIndex}-${item.nIndex}`] = true;
        }
    });

    measures.forEach((measure, mIndex) => {
        const row = document.createElement("div");
        row.className = "measure-row";
        row.dataset.measureIndex = mIndex;
        
        const num = document.createElement("div");
        num.className = "measure-number";
        num.textContent = `#${mIndex + 1}`;
        row.appendChild(num);

        const notesDiv = document.createElement("div");
        notesDiv.className = "measure-notes";
        notesDiv.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                notesDiv.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });

        measure.forEach((note, nIndex) => {
            const cell = document.createElement("div");
            cell.className = "note-cell";
            cell.dataset.noteIndex = nIndex;
            
            const statusKey = `${mIndex}-${nIndex}`;
            const status = noteStatusMap[statusKey];

            if (status === 'renda-start' || note === 5 || note === 6) {
                cell.classList.add("renda-start");
            } else if (status === 'renda-body') {
                cell.classList.add("renda-body");
            } else if (status === 'renda-end') {
                cell.classList.add("renda-end");
            } else if (status === 'balloon-left' || note === 7) {
                cell.classList.add("balloon-left");
                const countKey = `${mIndex}-${nIndex}`;
                if (course.balloonCounts[countKey] === undefined) {
                    course.balloonCounts[countKey] = 5;
                }
                const badge = document.createElement("span");
                badge.className = "balloon-count-badge";
                badge.textContent = course.balloonCounts[countKey];
                cell.appendChild(badge);
            } else if (status === 'balloon-right') {
                cell.classList.add("balloon-right");
            }

            if (balloonEndpointMap[statusKey]) {
                cell.classList.add("balloon-endpoint-overlay");
            }

            updateCellContent(cell, note, status);

            cell.addEventListener("click", () => {
                course.exists = true;
                if (state.selectedTool === "delete") {
                    if (note === 7) {
                        delete course.balloonCounts[`${mIndex}-${nIndex}`];
                        measures[mIndex][nIndex] = 0;
                    } else if (note === 8) {
                        measures[mIndex][nIndex] = 0;
                    } else {
                        measures[mIndex][nIndex] = 0;
                    }
                } else {
                    const val = parseInt(state.selectedTool);
                    if (val === 8) {
                        measures[mIndex][nIndex] = 8;
                    } else if (val === 7) {
                        measures[mIndex][nIndex] = 7;
                        const countKey = `${mIndex}-${nIndex}`;
                        const currentCnt = course.balloonCounts[countKey] || 5;
                        const newCnt = prompt("風船のヒット数（打数）を入力してください:", currentCnt);
                        if (newCnt !== null) {
                            course.balloonCounts[countKey] = parseInt(newCnt) || 5;
                        }
                        playSound("1");
                    } else {
                        measures[mIndex][nIndex] = val;
                        if (val >= 1 && val <= 4) {
                            playSound(state.selectedTool);
                        } else if (val === 5 || val === 6) {
                            playSound("1");
                        }
                    }
                }
                updateUIFromState();
            });
            notesDiv.appendChild(cell);
        });
        row.appendChild(notesDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "measure-actions";

        const insertBtn = document.createElement("button");
        insertBtn.textContent = "+挿入";
        insertBtn.addEventListener("click", () => {
            measures.splice(mIndex + 1, 0, Array(state.subdivision).fill(0));
            updateUIFromState();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.className = "danger";
        deleteBtn.addEventListener("click", () => {
            if (measures.length > 1) {
                measures.splice(mIndex, 1);
                updateUIFromState();
            } else {
                alert("最後の小節は削除できません。");
            }
        });

        actionsDiv.appendChild(insertBtn);
        actionsDiv.appendChild(deleteBtn);
        row.appendChild(actionsDiv);

        container.appendChild(row);
    });
}

function updateCellContent(cell, val, status) {
    if ((val >= 1 && val <= 4)) {
        const img = document.createElement("img");
        if (val === 1) img.src = "assets/img/Don.png";
        else if (val === 2) img.src = "assets/img/Ka.png";
        else if (val === 3) img.src = "assets/img/Don_2.png";
        else if (val === 4) img.src = "assets/img/Ka_2.png";
        cell.appendChild(img);
    }
}

function togglePlay() {
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

function resetPlay() {
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

let lastHighlightedRow = null;
let lastHighlightedCell = null;
let lastRendaSoundTime = 0;
let activeBalloonData = null;
let playedBalloonPopKeys = new Set();

function clearMeasureHighlight() {
    if (lastHighlightedRow) lastHighlightedRow.classList.remove("playing");
    if (lastHighlightedCell) lastHighlightedCell.classList.remove("playing-note");
    lastHighlightedRow = null;
    lastHighlightedCell = null;
    document.querySelectorAll(".measure-row").forEach(r => r.classList.remove("playing"));
    document.querySelectorAll(".note-cell.playing-note").forEach(c => c.classList.remove("playing-note"));
}

function updateLastPlayedNoteIndex() {
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
    lastRendaSoundTime = 0;
    activeBalloonData = null;
    playedBalloonPopKeys.clear();
}

function updatePlayback() {
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

function generateTJA() {
    let tja = `TITLE:${state.title}\nBPM:${state.bpm}\nOFFSET:${state.offset}\n`;
    if (state.audioFile) tja += `WAVE:${state.audioFile.name}\n`;
    tja += `\n`;
    const m = { easy: "0", normal: "1", hard: "2", oni: "3", edit: "4" };
    
    Object.keys(state.courses).forEach(k => {
        const course = state.courses[k];
        if (!course.exists) return;
        
        tja += `COURSE:${m[k]}\n`;
        
        let balloonCountsArr = [];
        course.measures.forEach((meas, mIdx) => {
            meas.forEach((note, nIdx) => {
                if (note === 7) {
                    const cnt = course.balloonCounts[`${mIdx}-${nIdx}`] !== undefined ? course.balloonCounts[`${mIdx}-${nIdx}`] : 5;
                    balloonCountsArr.push(cnt);
                }
            });
        });
        if (balloonCountsArr.length > 0) {
            tja += `#BALLOON ${balloonCountsArr.join(",")}\n`;
        }

        tja += `#START\n`;
        course.measures.forEach((meas, idx) => {
            const b = course.bpmChanges.find(i => i.measure === idx + 1);
            if (b) tja += `#BPMCHANGE ${b.bpm}\n`;
            
            let lineStr = "";
            for (let i = 0; i < meas.length; i++) {
                lineStr += meas[i];
            }
            tja += lineStr + ",\n";
        });
        tja += `#END\n\n`;
    });
    return tja;
}

async function downloadZip() {
    const zip = new JSZip();
    zip.file(`${state.title}.tja`, generateTJA());
    if (state.audioFile) zip.file(state.audioFile.name, state.audioFile);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${state.title}.zip`;
    a.click();
    URL.revokeObjectURL(url);
}
