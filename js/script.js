const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    subdivision: 16,
    currentCourse: "oni",
    courses: {
        easy: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [] },
        normal: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [] },
        hard: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [] },
        oni: { exists: true, measures: [Array(16).fill(0)], bpmChanges: [] },
        edit: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [] }
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

let soundBuffers = { don: null, ka: null };

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
        const donRes = await fetch("./assets/audio/Neiro1_Don.ogg");
        if (donRes.ok) {
            soundBuffers.don = await state.audioContext.decodeAudioData(await donRes.arrayBuffer());
        }
        const kaRes = await fetch("./assets/audio/Neiro1_Ka.ogg");
        if (kaRes.ok) {
            soundBuffers.ka = await state.audioContext.decodeAudioData(await kaRes.arrayBuffer());
        }
    } catch (e) {
        console.warn("効果音の読み込みに失敗しました。", e);
    }
}

function playSound(type) {
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

function setupEventListeners() {
    document.addEventListener("pointerdown", () => {
        if (state.audioContext && state.audioContext.state === "suspended") {
            state.audioContext.resume();
        }
    }, { once: true });

    document.getElementById("metaTitle").addEventListener("input", (e) => state.title = e.target.value);
    document.getElementById("metaBpm").addEventListener("change", (e) => state.bpm = parseFloat(e.target.value) || 120);
    document.getElementById("metaOffset").addEventListener("input", (e) => state.offset = parseFloat(e.target.value) || 0);

    document.getElementById("jumpMeasureBtn").addEventListener("click", () => {
        const m = parseInt(document.getElementById("jumpMeasureInput").value);
        if (m > 0) jumpToMeasure(m - 1);
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
        seekToTime((parseFloat(e.target.value) / 100) * state.audioBuffer.duration);
    });
}

function jumpToMeasure(mIndex) {
    const course = state.courses[state.currentCourse];
    let currentBpm = state.bpm;
    let targetTime = -state.offset;

    const targetM = Math.min(mIndex, course.measures.length - 1);
    for (let i = 0; i < targetM; i++) {
        const bChange = course.bpmChanges.find(bc => bc.measure === i + 1);
        if (bChange) currentBpm = bChange.bpm;
        targetTime += (60 / currentBpm) * 4;
    }

    if (targetTime < 0) targetTime = 0;

    const targetRow = document.querySelector(`.measure-row[data-measure-index="${targetM}"]`);
    if (targetRow) {
        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    seekToTime(targetTime);
}

function seekToTime(timeInSeconds) {
    state.playbackTime = Math.max(0, timeInSeconds);
    
    if (state.audioBuffer && state.audioBuffer.duration > 0) {
        const percent = (state.playbackTime / state.audioBuffer.duration) * 100;
        document.getElementById("seekBar").value = Math.min(100, percent);
    }

    if (state.isPlaying) {
        if (state.audioSource) try { state.audioSource.stop(); } catch(e) {}
        state.audioSource = state.audioContext.createBufferSource();
        state.audioSource.buffer = state.audioBuffer;
        state.audioSource.connect(state.audioContext.destination);
        state.audioSource.start(0, state.playbackTime);
        state.startTime = state.audioContext.currentTime - state.playbackTime;
    }
    updateLastPlayedNoteIndex();
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

    Object.keys(state.courses).forEach(k => { state.courses[k].measures = []; state.courses[k].bpmChanges = []; state.courses[k].exists = false; });

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("//")) continue;

        if (line.includes(":") && !inCourse) {
            const [key, ...valArr] = line.split(":");
            const val = valArr.join(":").trim();
            const k = key.trim().toUpperCase();
            if (k === "TITLE") state.title = val;
            if (k === "BPM") state.bpm = parseFloat(val) || 120;
            if (k === "OFFSET") state.offset = parseFloat(val) || 0;
            if (k === "COURSE" && courseMap[val.toUpperCase()]) activeCourse = courseMap[val.toUpperCase()];
        }

        if (line.toUpperCase() === "#START") { inCourse = true; measureBuffer = ""; continue; }
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
                    state.courses[activeCourse].measures.push(notes.length > 0 ? notes : [0]);
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
    const measures = state.courses[state.currentCourse].measures;

    let isInsideRenda = false;

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
            cell.dataset.noteIndex = nIndex; // 高速化用の目印
            
            if (note === 5 || note === 6) {
                isInsideRenda = true;
                cell.classList.add("renda-start");
            } else if (note === 8) {
                if (isInsideRenda) {
                    cell.classList.add("renda-end");
                    isInsideRenda = false;
                }
            } else if (isInsideRenda) {
                cell.classList.add("renda-body");
            }

            updateCellContent(cell, note);

            cell.addEventListener("click", () => {
                state.courses[state.currentCourse].exists = true;
                if (state.selectedTool === "delete") measures[mIndex][nIndex] = 0;
                else {
                    const val = parseInt(state.selectedTool);
                    measures[mIndex][nIndex] = val;
                    if (val >= 1 && val <= 4) playSound(state.selectedTool);
                }
                updateUIFromState();
            });
            notesDiv.appendChild(cell);
        });
        row.appendChild(notesDiv);
        container.appendChild(row);
    });
}

function updateCellContent(cell, val) {
    if (val >= 1 && val <= 4) {
        const img = document.createElement("img");
        if (val === 1) img.src = "assets/img/Don.png";
        else if (val === 2) img.src = "assets/img/Ka.png";
        else if (val === 3) {
            img.src = "assets/img/Don_2.png";
            img.classList.add("big-note");
        }
        else if (val === 4) {
            img.src = "assets/img/Ka_2.png";
            img.classList.add("big-note");
        }
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
    document.getElementById("seekBar").value = "0";
    clearMeasureHighlight();
}

function clearMeasureHighlight() {
    document.querySelectorAll(".measure-row.playing").forEach(r => r.classList.remove("playing"));
    document.querySelectorAll(".note-cell.playing-note").forEach(c => c.classList.remove("playing-note"));
}

function updateLastPlayedNoteIndex() {
    state.lastPlayedNoteIndex = -1;
    state.lastActiveMIndex = -1;
}

// 【超高速化版】DOM全体検索を廃止し、変更があった部分のみ直接更新する再生処理
let prevActiveM = -1;
let prevActiveN = -1;

function updatePlayback() {
    if (!state.isPlaying) return;
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;

    if (duration > 0) {
        if (state.playbackTime >= duration) { resetPlay(); return; }
        document.getElementById("seekBar").value = (state.playbackTime / duration) * 100;
        document.getElementById("currentTimeDisplay").textContent = `${state.playbackTime.toFixed(2)} / ${duration.toFixed(2)}s`;
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

        if (state.playbackTime >= accumulatedTime && state.playbackTime < accumulatedTime + mTime) {
            activeMIndex = m;
        }

        for (let n = 0; n < sub; n++) {
            const noteTime = accumulatedTime + (n * stepTime);
            
            if (state.playbackTime >= noteTime && state.playbackTime < noteTime + stepTime) {
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

    // 小節のスクロール
    if (activeMIndex !== -1 && activeMIndex !== state.lastActiveMIndex) {
        state.lastActiveMIndex = activeMIndex;
        const targetMIndex = Math.max(0, activeMIndex - 1);
        const targetRow = document.querySelector(`.measure-row[data-measure-index="${targetMIndex}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    // 【高速化の核心】前回と異なる部分だけクラスを付け替える（全検索ゼロ）
    if (prevActiveM !== activeMIndex || prevActiveN !== activeNIndex) {
        // 前回のハイライトを消す
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

        // 今回のハイライトをつける
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

function generateTJA() {
    let tja = `TITLE:${state.title}\nBPM:${state.bpm}\nOFFSET:${state.offset}\n`;
    if (state.audioFile) tja += `WAVE:${state.audioFile.name}\n`;
    tja += `\n`;
    const m = { easy: "0", normal: "1", hard: "2", oni: "3", edit: "4" };
    Object.keys(state.courses).forEach(k => {
        if (!state.courses[k].exists) return;
        tja += `COURSE:${m[k]}\n#START\n`;
        state.courses[k].measures.forEach((meas, idx) => {
            const b = state.courses[k].bpmChanges.find(i => i.measure === idx + 1);
            if (b) tja += `#BPMCHANGE ${b.bpm}\n`;
            tja += meas.join("") + ",\n";
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
