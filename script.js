// 状態管理（複数コース対応）
const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    measureType: "4/4",
    subdivision: 16,
    currentCourse: "oni", // 現在選択中のコース (easy, normal, hard, oni, edit)
    courses: {
        easy: { measures: Array(8).fill(0).map(() => Array(16).fill(0)), bpmChanges: [] },
        normal: { measures: Array(8).fill(0).map(() => Array(16).fill(0)), bpmChanges: [] },
        hard: { measures: Array(8).fill(0).map(() => Array(16).fill(0)), bpmChanges: [] },
        oni: { measures: Array(8).fill(0).map(() => Array(16).fill(0)), bpmChanges: [] },
        edit: { measures: Array(8).fill(0).map(() => Array(16).fill(0)), bpmChanges: [] }
    },
    selectedTool: "1",
    audioFile: null,
    audioFileName: "未名前",
    audioBuffer: null,
    isPlaying: false,
    startTime: 0,
    audioContext: null,
    audioSource: null,
    playbackTime: 0,
    lastCellIndex: -1
};

let soundBuffers = {
    don: null,
    ka: null
};

// DOM要素
const metaTitle = document.getElementById("metaTitle");
const metaBpm = document.getElementById("metaBpm");
const metaOffset = document.getElementById("metaOffset");
const metaMeasure = document.getElementById("metaMeasure");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const measuresContainer = document.getElementById("measuresContainer");
const audioFileInput = document.getElementById("audioFile");
const importZipInput = document.getElementById("importZip");
const audioFileNameSpan = document.getElementById("audioFileName");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");
const currentTimeDisplay = document.getElementById("currentTimeDisplay");

const bpmChangeMeasureInput = document.getElementById("bpmChangeMeasure");
const bpmChangeValueInput = document.getElementById("bpmChangeValue");
const addBpmChangeBtn = document.getElementById("addBpmChangeBtn");
const bpmChangeList = document.getElementById("bpmChangeList");
const courseTabs = document.querySelectorAll(".course-tab");

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
        if (!donRes.ok) throw new Error();
        const donArrayBuffer = await donRes.arrayBuffer();
        soundBuffers.don = await state.audioContext.decodeAudioData(donArrayBuffer);

        const kaRes = await fetch("assets/audio/Neiro1_Ka.ogg");
        if (!kaRes.ok) throw new Error();
        const kaArrayBuffer = await kaRes.arrayBuffer();
        soundBuffers.ka = await state.audioContext.decodeAudioData(kaArrayBuffer);
    } catch (e) {
        console.warn("効果音の読み込みに失敗しました（Live Server環境か確認してください）。", e);
    }
}

function playSound(type) {
    if (!state.audioContext) return;
    let buffer = (type === "1" || type === "3") ? soundBuffers.don : soundBuffers.ka;
    if (!buffer) {
        playFallbackSound(type);
        return;
    }
    try {
        const source = state.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(state.audioContext.destination);
        source.start(0);
    } catch(e) {}
}

function playFallbackSound(type) {
    try {
        const osc = state.audioContext.createOscillator();
        const gain = state.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime((type === "1" || type === "3") ? 300 : 500, state.audioContext.currentTime);
        gain.gain.setValueAtTime(0.3, state.audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, state.audioContext.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(state.audioContext.destination);
        osc.start();
        osc.stop(state.audioContext.currentTime + 0.1);
    } catch(e) {}
}

function setupEventListeners() {
    metaTitle.addEventListener("input", (e) => state.title = e.target.value);
    metaBpm.addEventListener("change", (e) => {
        state.bpm = parseFloat(e.target.value) || 120;
    });
    metaOffset.addEventListener("input", (e) => {
        state.offset = parseFloat(e.target.value) || 0;
    });
    metaMeasure.addEventListener("change", (e) => {
        state.measureType = e.target.value;
    });

    subdivisionSelect.addEventListener("change", (e) => {
        state.subdivision = parseInt(e.target.value);
        const measures = state.courses[state.currentCourse].measures;
        state.courses[state.currentCourse].measures = measures.map(m => {
            let newMeasure = Array(state.subdivision).fill(0);
            for(let i=0; i<Math.min(m.length, state.subdivision); i++) {
                newMeasure[i] = m[i];
            }
            return newMeasure;
        });
        renderEditor();
    });

    // コースタブ切り替え
    courseTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            courseTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            state.currentCourse = tab.getAttribute("data-course");
            updateUIFromState();
        });
    });

    addBpmChangeBtn.addEventListener("click", () => {
        const m = parseInt(bpmChangeMeasureInput.value);
        const b = parseFloat(bpmChangeValueInput.value);
        if (isNaN(m) || isNaN(b) || m < 1 || b <= 0) return;

        const bpmChanges = state.courses[state.currentCourse].bpmChanges;
        const existing = bpmChanges.find(item => item.measure === m);
        if (existing) {
            existing.bpm = b;
        } else {
            bpmChanges.push({ measure: m, bpm: b });
            bpmChanges.sort((a, b) => a.measure - b.measure);
        }
        renderBpmChanges();
    });

    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedTool = btn.getAttribute("data-note");
        });
    });

    audioFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith("audio/")) {
            alert("エラー: 音声ファイルを選択してください");
            audioFileInput.value = "";
            return;
        }
        await loadAudioFile(file);
    });

    // ZIPインポート機能（複数コース対応）
    importZipInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            let tjaText = "";
            let audioFileObj = null;

            for (let filename of Object.keys(zipContent.files)) {
                const zipEntry = zipContent.files[filename];
                if (filename.endsWith(".tja")) {
                    tjaText = await zipEntry.async("text");
                } else if (filename.match(/\.(ogg|mp3|wav)$/i)) {
                    const blob = await zipEntry.async("blob");
                    audioFileObj = new File([blob], filename, { type: blob.type });
                }
            }

            if (!tjaText) {
                alert("エラー: ZIP内にTJAファイルが見つかりませんでした。");
                return;
            }

            parseTJA(tjaText);

            if (audioFileObj) {
                await loadAudioFile(audioFileObj);
            }

            metaTitle.value = state.title;
            metaBpm.value = state.bpm;
            metaOffset.value = state.offset;
            updateUIFromState();
            alert("ZIPファイルのインポートに成功しました！");

        } catch (err) {
            alert("エラー: ZIPファイルの解析に失敗しました。");
            console.error(err);
        }
        importZipInput.value = "";
    });

    playBtn.addEventListener("click", togglePlay);
    stopBtn.addEventListener("click", resetPlay);
    downloadBtn.addEventListener("click", downloadZip);
}

async function loadAudioFile(file) {
    state.audioFile = file;
    state.audioFileName = file.name;
    audioFileNameSpan.textContent = file.name;
    try {
        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
        alert("エラー: 音楽ファイルのデコードに失敗しました。");
    }
}

// 複数コース対応TJAパーサー
function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    let title = "sample";
    let bpm = 120;
    let offset = 0;
    
    // 全コース初期化
    const coursesData = {
        easy: { measures: [], bpmChanges: [] },
        normal: { measures: [], bpmChanges: [] },
        hard: { measures: [], bpmChanges: [] },
        oni: { measures: [], bpmChanges: [] },
        edit: { measures: [], bpmChanges: [] }
    };

    let activeCourseKey = "oni";
    let inCourse = false;
    let currentMeasures = [];
    let currentBpmChanges = [];

    const courseMap = {
        "0": "easy",
        "1": "normal",
        "2": "hard",
        "3": "oni",
        "4": "edit",
        "EASY": "easy",
        "NORMAL": "normal",
        "HARD": "hard",
        "ONI": "oni",
        "EDIT": "edit"
    };

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith("TITLE:")) title = line.substring(6).trim();
        if (line.startsWith("BPM:")) bpm = parseFloat(line.substring(4)) || 120;
        if (line.startsWith("OFFSET:")) offset = parseFloat(line.substring(7)) || 0;

        if (line.toUpperCase().startsWith("COURSE:")) {
            const val = line.substring(7).trim().toUpperCase();
            if (courseMap[val]) {
                activeCourseKey = courseMap[val];
            }
        }

        if (line.startsWith("#START")) {
            inCourse = true;
            currentMeasures = [];
            currentBpmChanges = [];
            continue;
        }

        if (line.startsWith("#END")) {
            inCourse = false;
            coursesData[activeCourseKey] = {
                measures: currentMeasures.length > 0 ? currentMeasures : [Array(16).fill(0)],
                bpmChanges: currentBpmChanges
            };
            continue;
        }

        if (inCourse) {
            if (line.toUpperCase().startsWith("#BPMCHANGE:")) {
                const newBpm = parseFloat(line.substring(11));
                if (!isNaN(newBpm)) {
                    currentBpmChanges.push({ measure: currentMeasures.length + 1, bpm: newBpm });
                }
                continue;
            }

            if (line.endsWith(",")) {
                line = line.slice(0, -1);
            }

            if (line.length > 0) {
                let notes = [];
                for (let i = 0; i < line.length; i++) {
                    let char = line[i];
                    if (["0","1","2","3","4"].includes(char)) {
                        notes.push(parseInt(char));
                    }
                }
                if (notes.length > 0) {
                    currentMeasures.push(notes);
                }
            }
        }
    }

    state.title = title;
    state.bpm = bpm;
    state.offset = offset;
    
    // データが空のコースにはデフォルトの空小節を設定
    Object.keys(coursesData).forEach(key => {
        if (coursesData[key].measures.length === 0) {
            coursesData[key].measures = Array(8).fill(0).map(() => Array(16).fill(0));
        }
    });

    state.courses = coursesData;
    // デフォルトで最初に見つかった音符があるコース、またはoniを選択
    state.currentCourse = "oni";
}

function updateUIFromState() {
    renderEditor();
    renderBpmChanges();
}

function renderBpmChanges() {
    bpmChangeList.innerHTML = "";
    const bpmChanges = state.courses[state.currentCourse].bpmChanges;
    bpmChanges.forEach((item, index) => {
        const div = document.createElement("div");
        div.className = "bpm-item";
        div.innerHTML = `<span>#${item.measure}小節〜: BPM ${item.bpm}</span>`;
        const delBtn = document.createElement("button");
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
            bpmChanges.splice(index, 1);
            renderBpmChanges();
        });
        div.appendChild(delBtn);
        bpmChangeList.appendChild(div);
    });
}

function renderEditor() {
    measuresContainer.innerHTML = "";
    const courseData = state.courses[state.currentCourse];
    const measures = courseData.measures;

    if (measures.length > 0) {
        state.subdivision = measures[0].length;
        subdivisionSelect.value = state.subdivision.toString();
    }

    measures.forEach((measure, mIndex) => {
        const row = document.createElement("div");
        row.className = "measure-row";

        const num = document.createElement("div");
        num.className = "measure-number";
        num.textContent = `#${mIndex + 1}`;
        row.appendChild(num);

        const notesDiv = document.createElement("div");
        notesDiv.className = "measure-notes";

        measure.forEach((note, nIndex) => {
            const cell = document.createElement("div");
            cell.className = "note-cell";
            
            updateCellContent(cell, note);

            cell.addEventListener("click", () => {
                if (state.selectedTool === "delete") {
                    measures[mIndex][nIndex] = 0;
                } else {
                    measures[mIndex][nIndex] = parseInt(state.selectedTool);
                    playSound(state.selectedTool);
                }
                updateCellContent(cell, measures[mIndex][nIndex]);
            });

            notesDiv.appendChild(cell);
        });

        row.appendChild(notesDiv);
        measuresContainer.appendChild(row);
    });
}

function updateCellContent(cell, noteValue) {
    cell.innerHTML = "";
    if (noteValue === 0) return;

    const img = document.createElement("img");
    if (noteValue === 1) img.src = "assets/img/Don.png";
    else if (noteValue === 2) img.src = "assets/img/Ka.png";
    else if (noteValue === 3) img.src = "assets/img/Don_2.png";
    else if (noteValue === 4) img.src = "assets/img/Ka_2.png";
    
    cell.appendChild(img);
}

function togglePlay() {
    if (state.isPlaying) {
        pausePlay();
    } else {
        startPlay();
    }
}

function startPlay() {
    if (state.audioContext.state === "suspended") {
        state.audioContext.resume();
    }

    state.isPlaying = true;
    playBtn.textContent = "一時停止";

    if (state.audioBuffer) {
        if (state.audioSource) {
            try { state.audioSource.stop(); } catch(e) {}
        }
        state.audioSource = state.audioContext.createBufferSource();
        state.audioSource.buffer = state.audioBuffer;
        state.audioSource.connect(state.audioContext.destination);
        state.audioSource.start(0, Math.max(0, state.playbackTime));
    }

    state.startTime = state.audioContext.currentTime - state.playbackTime;
    requestAnimationFrame(updatePlayback);
}

function pausePlay() {
    state.isPlaying = false;
    playBtn.textContent = "再生 / 停止";
    if (state.audioSource) {
        try { state.audioSource.stop(); } catch(e) {}
        state.audioSource = null;
    }
    if (state.audioBuffer) {
        state.playbackTime = state.audioContext.currentTime - state.startTime;
        if (state.playbackTime < 0) state.playbackTime = 0;
    }
}

function resetPlay() {
    pausePlay();
    state.playbackTime = 0;
    state.lastCellIndex = -1;
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
    currentTimeDisplay.textContent = `0.00 / ${duration.toFixed(2)}s`;
}

function updatePlayback() {
    if (!state.isPlaying) return;
    
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;

    if (state.audioBuffer && state.playbackTime >= duration) {
        resetPlay();
        return;
    }
    
    const chartTime = state.playbackTime + state.offset;
    const courseData = state.courses[state.currentCourse];

    if (chartTime >= 0) {
        let currentBpm = state.bpm;
        let accumulatedTime = 0;
        let targetMeasure = 0;
        let targetCell = 0;
        let found = false;

        for (let m = 0; m < courseData.measures.length; m++) {
            const change = courseData.bpmChanges.find(item => item.measure === m + 1);
            if (change) {
                currentBpm = change.bpm;
            }

            const measureSec = (60 / currentBpm) * 4;
            const cellSec = measureSec / courseData.measures[m].length;

            for (let c = 0; c < courseData.measures[m].length; c++) {
                if (accumulatedTime <= chartTime && chartTime < accumulatedTime + cellSec) {
                    targetMeasure = m;
                    targetCell = c;
                    found = true;
                    break;
                }
                accumulatedTime += cellSec;
            }
            if (found) break;
        }

        if (found) {
            const totalCellsIndex = targetMeasure * 1000 + targetCell;
            if (state.lastCellIndex !== totalCellsIndex) {
                const note = courseData.measures[targetMeasure][targetCell];
                if (note > 0) {
                    playSound(note.toString());
                }
                state.lastCellIndex = totalCellsIndex;
            }
        }
    }

    currentTimeDisplay.textContent = `${state.playbackTime.toFixed(2)} / ${duration.toFixed(2)}s`;
    requestAnimationFrame(updatePlayback);
}

function generateTJA() {
    let tja = `TITLE:${state.title}\n`;
    tja += `BPM:${state.bpm}\n`;
    tja += `WAVE:${state.audioFile ? state.audioFile.name : "sample.ogg"}\n`;
    tja += `OFFSET:${state.offset}\n`;

    const courseCodeMap = {
        easy: { course: 0, level: 3 },
        normal: { course: 1, level: 5 },
        hard: { course: 2, level: 7 },
        oni: { course: 3, level: 8 },
        edit: { course: 4, level: 10 }
    };

    // すべてのコースを順番に書き出す
    Object.keys(state.courses).forEach(key => {
        const courseData = state.courses[key];
        const info = courseCodeMap[key];

        tja += `COURSE:${info.course}\n`;
        tja += `LEVEL:${info.level}\n`;
        tja += `BALLOON:\n`;
        tja += `#START\n`;

        courseData.measures.forEach((measure, mIndex) => {
            const change = courseData.bpmChanges.find(item => item.measure === mIndex + 1);
            if (change) {
                tja += `#BPMCHANGE:${change.bpm}\n`;
            }
            let line = measure.join("");
            tja += line + ",\n";
        });

        tja += `#END\n`;
    });

    return tja;
}

async function downloadZip() {
    const zip = new JSZip();
    const tjaContent = generateTJA();
    zip.file(`${state.title}.tja`, tjaContent);

    if (state.audioFile) {
        zip.file(state.audioFile.name, state.audioFile);
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.title}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
