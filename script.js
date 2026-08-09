// 状態管理
const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    measureType: "4/4",
    subdivision: 16,
    measuresCount: 4,
    measures: Array(4).fill(0).map(() => Array(16).fill(0)),
    selectedTool: "1",
    audioFile: null,
    audioFileName: "未選択",
    audioBuffer: null,
    isPlaying: false,
    startTime: 0,
    audioContext: null,
    audioSource: null,
    playbackTime: 0,
    lastCellIndex: -1
};

// サウンドエフェクト用バッファ
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
const audioFileNameSpan = document.getElementById("audioFileName");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const downloadBtn = document.getElementById("downloadBtn");
const currentTimeDisplay = document.getElementById("currentTimeDisplay");

// 初期化
window.addEventListener("DOMContentLoaded", () => {
    initAudioContext();
    loadSoundEffects();
    setupEventListeners();
    renderEditor();
});

function initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
}

// 効果音の読み込み
async function loadSoundEffects() {
    try {
        const donRes = await fetch("assets/audio/Neiro1_Don.ogg");
        if (!donRes.ok) throw new Error("Don.oggが見つかりません");
        const donArrayBuffer = await donRes.arrayBuffer();
        soundBuffers.don = await state.audioContext.decodeAudioData(donArrayBuffer);

        const kaRes = await fetch("assets/audio/Neiro1_Ka.ogg");
        if (!kaRes.ok) throw new Error("Ka.oggが見つかりません");
        const kaArrayBuffer = await kaRes.arrayBuffer();
        soundBuffers.ka = await state.audioContext.decodeAudioData(kaArrayBuffer);
    } catch (e) {
        console.warn("効果音の読み込みに失敗しました（Live Server環境か確認してください）。", e);
    }
}

// 効果音の再生
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
    } catch(e) {
        console.error("効果音再生エラー:", e);
    }
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
        state.measures = state.measures.map(m => {
            let newMeasure = Array(state.subdivision).fill(0);
            for(let i=0; i<Math.min(m.length, state.subdivision); i++) {
                newMeasure[i] = m[i];
            }
            return newMeasure;
        });
        renderEditor();
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
            alert("エラー: 音声ファイルを選択してください（mp3, ogg, wavなど）");
            audioFileInput.value = "";
            return;
        }

        state.audioFile = file;
        state.audioFileName = file.name;
        audioFileNameSpan.textContent = file.name;

        try {
            const arrayBuffer = await file.arrayBuffer();
            state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        } catch (err) {
            alert("エラー: 音楽ファイルの読み込みに失敗しました。");
            console.error(err);
        }
    });

    playBtn.addEventListener("click", togglePlay);
    stopBtn.addEventListener("click", resetPlay);
    downloadBtn.addEventListener("click", downloadZip);
}

function renderEditor() {
    measuresContainer.innerHTML = "";

    state.measures.forEach((measure, mIndex) => {
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
                    state.measures[mIndex][nIndex] = 0;
                } else {
                    state.measures[mIndex][nIndex] = parseInt(state.selectedTool);
                    playSound(state.selectedTool);
                }
                updateCellContent(cell, state.measures[mIndex][nIndex]);
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
        
        // 音楽は常に曲の最初（0秒）から再生をスタートさせる
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

// 音楽の再生時間から「OFFSET分のウェイト」を引いた時間を譜面進行の基準にする
function updatePlayback() {
    if (!state.isPlaying) return;
    
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;

    if (state.audioBuffer && state.playbackTime >= duration) {
        resetPlay();
        return;
    }
    
    // 【OFFSETの反映】
    // 曲が始まってから state.offset 秒（例: 0.77秒）経過するまでは譜面を待たせる（chartTimeをマイナスにする）
    // 例: offsetが -0.77 の場合、 playbackTime が 0.77 のときに chartTime が 0（1小節目の頭）になる
    const chartTime = state.playbackTime + state.offset;

    if (chartTime >= 0) {
        const secondsPerBeat = 60 / state.bpm;
        const secondsPerMeasure = secondsPerBeat * 4; // 4/4拍子ベース
        const secondsPerCell = secondsPerMeasure / state.subdivision;

        if (secondsPerCell > 0) {
            const totalCells = Math.floor(chartTime / secondsPerCell);
            const mIndex = Math.floor(totalCells / state.subdivision);
            const nIndex = totalCells % state.subdivision;

            if (state.lastCellIndex !== totalCells && mIndex < state.measures.length) {
                if (nIndex >= 0 && nIndex < state.measures[mIndex].length) {
                    const note = state.measures[mIndex][nIndex];
                    if (note > 0) {
                        playSound(note.toString());
                    }
                }
                state.lastCellIndex = totalCells;
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
    tja += `COURSE:0\n`;
    tja += `LEVEL:5\n`;
    tja += `BALLOON:\n`;
    tja += `#START\n`;

    state.measures.forEach((measure) => {
        let line = measure.join("");
        tja += line + ",\n";
    });

    tja += `#END\n`;
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
