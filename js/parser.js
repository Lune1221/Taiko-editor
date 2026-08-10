import { state } from './state.js';
import { loadAudioFile } from './audio.js';
import { updateUIFromState } from './ui.js';

export function parseTJA(text) {
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

export function generateTJA() {
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

export async function downloadZip() {
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
