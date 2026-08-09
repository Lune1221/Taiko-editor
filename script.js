// ... (状態管理や変数はそのまま)

// 音楽ファイル読み込みの修正
audioFileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    state.audioFile = file;
    state.audioFileName = file.name;
    audioFileNameSpan.textContent = file.name;

    // FileReaderで安全に読み込み
    const reader = new FileReader();
    reader.onload = async (event) => {
        const arrayBuffer = event.target.result;
        state.audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    };
    reader.readAsArrayBuffer(file);
});

// 再生中の自動演奏ロジックを追加
function updatePlayback() {
    if (!state.isPlaying) return;
    state.playbackTime = state.audioContext.currentTime - state.startTime;
    
    const duration = state.audioBuffer ? state.audioBuffer.duration : 0;
    
    // 譜面と音の同期：現在の時間から「どのセルか」を計算
    // ※BPMとsubdivisionから1セルの秒数を計算
    const secondsPerBeat = 60 / state.bpm;
    const secondsPerMeasure = secondsPerBeat * 4; // 4/4拍子固定で簡易計算
    const secondsPerCell = secondsPerMeasure / state.subdivision;

    // 現在の小節とセルを特定
    const totalCells = Math.floor(state.playbackTime / secondsPerCell);
    const mIndex = Math.floor(totalCells / state.subdivision);
    const nIndex = totalCells % state.subdivision;

    // 音符があるかチェック（簡易的な演奏ロジック）
    // 前回のチェック位置とずれていたら鳴らす
    if (state.lastCellIndex !== totalCells && mIndex < state.measures.length) {
        const note = state.measures[mIndex][nIndex];
        if (note > 0) {
            playSound(note.toString());
        }
        state.lastCellIndex = totalCells;
    }

    currentTimeDisplay.textContent = `${state.playbackTime.toFixed(2)} / ${duration.toFixed(2)}s`;

    if (state.audioBuffer && state.playbackTime >= duration) {
        stopPlay();
        return;
    }

    requestAnimationFrame(updatePlayback);
}

// startPlay関数の冒頭に追記
function startPlay() {
    state.isPlaying = true;
    state.lastCellIndex = -1; // 演奏開始位置リセット
    // ... (既存のオーディオソース処理はそのまま)
}

// ... (他の関数はそのまま)
