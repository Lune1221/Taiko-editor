export const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    subdivision: 16,
    currentCourse: "oni",
    courses: {
        easy: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [], scrollChanges: {}, balloonCounts: {} },
        normal: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [], scrollChanges: {}, balloonCounts: {} },
        hard: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [], scrollChanges: {}, balloonCounts: {} },
        oni: { exists: true, measures: [Array(16).fill(0)], bpmChanges: [], scrollChanges: {}, balloonCounts: {} },
        edit: { exists: false, measures: [Array(16).fill(0)], bpmChanges: [], scrollChanges: {}, balloonCounts: {} }
    },
    selectedTool: "1",
    audioFile: null,
    audioElement: null,
    audioContext: null,
    isPlaying: false,
    playbackTime: 0,
    startTime: 0,
    lastPlayedNoteIndex: -1,
    lastActiveMIndex: -1
};

// Local Storage から保存データをロードする関数
export function loadFromLocalStorage() {
    const saved = localStorage.getItem("taikoEditorData");
    if (!saved) return;
    try {
        const data = JSON.parse(saved);
        if (data.title !== undefined) state.title = data.title;
        if (data.bpm !== undefined) state.bpm = data.bpm;
        if (data.offset !== undefined) state.offset = data.offset;
        if (data.courses) state.courses = data.courses;
    } catch (e) {
        console.warn("セーブデータの復元に失敗しました。", e);
    }
}
