import { state } from './state.js';
import { playSound, togglePlay, resetPlay, loadAudioFile, updateLastPlayedNoteIndex } from './audio.js';
import { parseTJA, downloadZip } from './parser.js';

// Local Storageへ保存する関数
export function saveToLocalStorage() {
    const data = {
        title: state.title,
        bpm: state.bpm,
        offset: state.offset,
        courses: state.courses
    };
    localStorage.setItem("taikoEditorData", JSON.stringify(data));
}

export function updateBpmChangeListUI() {
    const listDiv = document.getElementById("bpmChangeList");
    listDiv.innerHTML = "";
    const course = state.courses[state.currentCourse];
    course.bpmChanges.forEach(item => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.marginBottom = "2px";
        row.innerHTML = `<span>#${item.measure} : ${item.bpm} BPM</span>`;
        
        const btn = document.createElement("button");
        btn.textContent = "×";
        btn.style.cssText = "background:#c0392b; color:#fff; border:none; padding:1px 5px; border-radius:3px; cursor:pointer; font-size:10px;";
        btn.onclick = () => {
            course.bpmChanges = course.bpmChanges.filter(i => i.measure !== item.measure);
            updateBpmChangeListUI();
            saveToLocalStorage();
        };
        row.appendChild(btn);
        listDiv.appendChild(row);
    });
}

export function updateUIFromState() {
    document.querySelectorAll(".course-tab").forEach(tab => {
        const k = tab.getAttribute("data-course");
        tab.classList.toggle("has-data", state.courses[k].exists);
        tab.classList.toggle("active", k === state.currentCourse);
    });

    updateBpmChangeListUI();
    
    const container = document.getElementById("measuresContainer");
    container.innerHTML = "";
    
    // 安全装置：万が一 measures が空ならデフォルトの1小節を作成
    const course = state.courses[state.currentCourse];
    if (!course.measures || course.measures.length === 0) {
        course.measures = [Array(state.subdivision).fill(0)];
    }
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
                saveToLocalStorage();
            });
            notesDiv.appendChild(cell);
        });
        row.appendChild(notesDiv);

        const scrollDiv = document.createElement("div");
        scrollDiv.style.cssText = "display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-size: 11px; color: #aaa;";
        scrollDiv.innerHTML = `<span>SCROLL:</span>`;
        const scrollInput = document.createElement("input");
        scrollInput.type = "number";
        scrollInput.step = "0.1";
        scrollInput.value = course.scrollChanges[mIndex] !== undefined ? course.scrollChanges[mIndex] : 1.0;
        scrollInput.style.cssText = "width: 45px; padding: 3px; border-radius: 4px; border: 1px solid #555; background: #1e1e28; color: #fff; font-size: 11px;";
        scrollInput.addEventListener("change", (e) => {
            const val = parseFloat(e.target.value);
            if (!isNaN(val) && val !== 1.0) {
                course.scrollChanges[mIndex] = val;
            } else {
                delete course.scrollChanges[mIndex];
            }
            saveToLocalStorage();
        });
        scrollDiv.appendChild(scrollInput);
        row.appendChild(scrollDiv);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "measure-actions";

        const insertBtn = document.createElement("button");
        insertBtn.textContent = "+挿入";
        insertBtn.addEventListener("click", () => {
            measures.splice(mIndex + 1, 0, Array(state.subdivision).fill(0));
            updateUIFromState();
            saveToLocalStorage();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "削除";
        deleteBtn.className = "danger";
        deleteBtn.addEventListener("click", () => {
            if (measures.length > 1) {
                measures.splice(mIndex, 1);
                updateUIFromState();
                saveToLocalStorage();
            } else {
                alert("最後の小節は削除できません。");
            }
        });

        actionsDiv.appendChild(insertBtn);
        actionsDiv.appendChild(deleteBtn);
        row.appendChild(actionsDiv);

        container.appendChild(row);
    });

    // 状態が更新されるたびに自動保存
    saveToLocalStorage();
}

function updateCellContent(cell, val, status) {
    if (val >= 1 && val <= 4) {
        const img = document.createElement("img");
        if (val === 1) img.src = "assets/img/Don.png";
        else if (val === 2) img.src = "assets/img/Ka.png";
        else if (val === 3) {
            img.src = "assets/img/Don_2.png";
            img.className = "big-note";
        } else if (val === 4) {
            img.src = "assets/img/Ka_2.png";
            img.className = "big-note";
        }
        cell.appendChild(img);
    }
}

export function setupEventListeners() {
    document.addEventListener("pointerdown", () => {
        if (state.audioContext && state.audioContext.state === "suspended") state.audioContext.resume();
    }, { once: true });

    document.getElementById("metaTitle").addEventListener("input", (e) => {
        state.title = e.target.value;
        saveToLocalStorage();
    });
    document.getElementById("metaBpm").addEventListener("change", (e) => {
        state.bpm = parseFloat(e.target.value) || 120;
        saveToLocalStorage();
    });
    document.getElementById("metaOffset").addEventListener("input", (e) => {
        state.offset = parseFloat(e.target.value) || 0;
        saveToLocalStorage();
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
            saveToLocalStorage();
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
