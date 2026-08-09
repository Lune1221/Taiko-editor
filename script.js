// 状態管理
const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    measureType: "4/4",
    subdivision: 16, // 1小節あたりの音符スロット数
    measuresCount: 4, // 初期小節数
    measures: Array(4).fill(0).map(() => Array(16).fill(0)),
    selectedTool: "1", // デフォルト：ドン
    audioFile: null,
    audioFileName: "未選択",
    audioBuffer: null,
    isPlaying: false,
    startTime: 0,
    audioContext: null,
    audioSource: null,
    playbackTime: 0
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

// オーディオコンテキストの初期化
function initAudioContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();
}

// 効果音の読み込み (assets/audio/ から)
async function loadSoundEffects() {
    try {
        const donRes = await fetch("assets/audio/Neiro1_Don.ogg");
        const donArrayBuffer = await donRes.arrayBuffer();
        soundBuffers.don = await state.audioContext.decodeAudioData(donArrayBuffer);

        const kaRes = await fetch("assets/audio/Neiro1_Ka.ogg");
        const kaArrayBuffer = await kaRes.arrayBuffer();
        soundBuffers.ka = await state.audioContext.decodeAudioData(kaArrayBuffer);
    } catch (e) {
        console.warn("効果音の自動読み込みに失敗しました（ローカル環境ではCORSエラーになる場合があります）。", e);
    }
}

// 効果音の再生
function playSound(type) {
    if (!state.audioContext) return;
    let buffer = (type === "1" || type === "3") ? soundBuffers.don : soundBuffers.ka;
    if (!buffer) return;

    const source = state.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(state.audioContext.destination);
    source.start(0);
}

// イベントリスナーの設定
function setupEventListeners() {
    metaTitle.addEventListener("input", (e) => state.title = e.target.value);
    metaBpm.addEventListener("change", (e) => {
        state.bpm = parseFloat(e.target.value) || 120;
    });
    metaOffset.addEventListener("input", (e) => state.offset = parseFloat(e.target.value) || 0);
    
    metaMeasure.addEventListener("change", (e) => {
        state.measureType = e.target.value;
    });

    subdivisionSelect.addEventListener("change", (e) => {
        state.subdivision = parseInt(e.target.value);
        // 小節データの長さを更新
        state.measures = state.measures.map(m => {
            let newMeasure = Array(state.subdivision).fill(0);
            for(let i=0; i<Math.min(m.length, state.subdivision); i++) {
                newMeasure[i] = m[i];
            }
            return newMeasure;
        });
        renderEditor();
    });

    // ツール選択
    document.querySelectorAll(".tool-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.selectedTool = btn.getAttribute("data-note");
        });
    });

    // 音楽ファイル読み込み
    audioFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        state.audioFile = file;
        state.audioFileName = file.name;
        audioFileNameSpan.textContent = file.name;

        const arrayBuffer = await file.arrayBuffer();
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    });

    playBtn.addEventListener("click", togglePlay);
    stopBtn.addEventListener("click", stopPlay);
    downloadBtn.addEventListener("click", downloadZip);
}

// 譜面の描画
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

// セル内の画像更新
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

// 再生機能
function togglePlay() {
    if (state.isPlaying) {
        stopPlay();
    } else {
        startPlay();
    }
}

function startPlay() {
    state.isPlaying = true;
    if (state.audioContext.state === "suspended") {
        state.audioContext.resume();
    }

    if (state.audioBuffer) {
        state.audioSource = state.audioContext.createBufferSource();
        state.audioSource.buffer = state.audioBuffer;
        state.audioSource.connect(state.audioContext.destination);
        state.audioSource.start(0, state.playbackTime);
    }

    state.startTime = state.audioContext.currentTime - state.playbackTime;
    requestAnimationFrame(updatePlayback);
}

function stopPlay() {
    state.isPlaying = false;
    if (state.audioSource) {
        try { state.audioSource.stop(); } catch(e) {}
        state.audioSource = null;
    }
    state.playbackTime = 0;
    currentTimeDisplay.textContent = `0.00 / ${state.audioBuffer ? state.audioBuffer.duration.toFixed(2) : "0.00"}s`;
}

function updatePlayback() {
    if (!state.isPlaying) return;
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
    currentTimeDisplay.textContent = `${state.playbackTime.toFixed(2)} / ${duration.toFixed(2)}s`;

    if (state.audioBuffer && state.playbackTime >= duration) {
        stopPlay();
        return;
    }

    requestAnimationFrame(updatePlayback);
}

// TJAファイルの生成
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
        // 音符データを文字列に変換 (例: 10002000...)
        let line = measure.join("");
        tja += line + ",\n";
    });

    tja += `#END\n`;
    return tja;
}

// ZIPダウンロード機能
async function downloadZip() {
    const zip = new JSZip();

    // 1. TJAファイルの追加
    const tjaContent = generateTJA();
    zip.file(`${state.title}.tja`, tjaContent);

    // 2. 音楽ファイルがある場合は追加
    if (state.audioFile) {
        zip.file(state.audioFile.name, state.audioFile);
    }

    // 3. ZIP生成とダウンロード
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
