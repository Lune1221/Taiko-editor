export const state = {
    bpm: 120,
    offset: 0,
    title: "sample",
    subdivision: 16,
    currentCourse: "oni",
    courses: {
        easy: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [], scrollChanges: {} },
        normal: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [], scrollChanges: {} },
        hard: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [], scrollChanges: {} },
        oni: { exists: true, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [], scrollChanges: {} },
        edit: { exists: false, measures: [Array(16).fill(0)], balloonCounts: {}, bpmChanges: [], scrollChanges: {} }
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

export const soundBuffers = { don: null, ka: null, balloon: null };
