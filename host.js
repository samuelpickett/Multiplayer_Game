const API = "http://127.0.0.1:8000";
const byId = (id) => document.getElementById(id);
const previewMode = new URLSearchParams(location.search).get("preview");
const previewQuestion = previewMode === "question";
const previewResults = previewMode === "results";
const hostId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
let refreshing = false;
let lastPhase = "";
const previewState = {
  phase: "question", question_number: 1, question_count: 3,
  remaining_ms: 14000, answer_count: 2, player_count: 4,
  question: {
    prompt: "Which planet is known as the Red Planet?",
    choices: ["Venus", "Mars", "Jupiter", "Mercury"],
  },
};
const previewResultsState = {
  phase: "finished", end_reason: "completed",
  winners: ["Malik"],
  top_five: [
    { name: "Malik", score: 500 }, { name: "Taylor", score: 400 },
    { name: "Alice", score: 400 }, { name: "Jordan", score: 300 },
    { name: "Sam", score: 200 },
  ],
};

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showSection(id) {
  for (const section of ["lobby", "round", "results"]) {
    byId(section).hidden = section !== id;
  }
}

function fillList(element, items, format) {
  element.replaceChildren();
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = format(item);
    element.append(li);
  }
}

function render(state) {
  byId("status").textContent = state.phase === "lobby" ? "Waiting for players" :
    state.phase === "finished" ?
      (state.end_reason === "host_left" ? "Host left. Game ended." : "Game complete") : "Game in progress";

  if (state.phase === "lobby") {
    showSection("lobby");
    byId("player-count").textContent = state.player_count;
    fillList(byId("player-list"), state.players, (name) => name);
    byId("start-button").disabled = state.player_count === 0;
    byId("join-link").href = state.join_url;
    byId("join-link").textContent = state.join_url;
    if (lastPhase !== "lobby") byId("join-qr").src = `${API}/api/qr.svg`;
  } else if (state.phase === "question" || state.phase === "reveal") {
    showSection("round");
    byId("question-number").textContent = state.question_number;
    byId("question-count").textContent = state.question_count;
    byId("question-prompt").textContent = state.question.prompt;
    byId("timer").textContent = state.phase === "question" ?
      `${Math.ceil(state.remaining_ms / 1000)} seconds` : "Answers closed";
    fillList(byId("choices"), state.question.choices, (choice) => choice);
    byId("answer-count").textContent = `${state.answer_count} of ${state.player_count} answered`;
    byId("correct-answer").hidden = state.phase !== "reveal";
    if (state.phase === "reveal") {
      byId("correct-answer").textContent = `Correct answer: ${state.question.choices[state.correct_answer]}`;
    }

  } else if (state.phase === "finished") {
    showSection("results");
    byId("winner-label").textContent = !state.winners.length ? "Final results" :
      state.winners.length === 1 ? "And the winner is" : "And the winners are";
    byId("winner").textContent = state.end_reason === "host_left" ? "Game ended early because the host left." :
      state.winners.join(", ");
    fillList(byId("top-five"), state.top_five, (entry) => `${entry.name} — ${entry.score} points`);
  }
  lastPhase = state.phase;
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    render(await request(`/api/state?host=1&host_id=${encodeURIComponent(hostId)}`));
  } catch (error) {
    byId("status").textContent = `Cannot reach the Python server: ${error.message}`;
  } finally {
    refreshing = false;
  }
}

async function hostAction(path) {
  try {
    await request(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ host_id: hostId }),
    });
    await refresh();
  } catch (error) {
    byId("status").textContent = error.message;
  }
}

byId("start-button").addEventListener("click", () => hostAction("/api/start"));
byId("reset-button").addEventListener("click", () => hostAction("/api/reset"));
if (previewQuestion || previewResults) {
  render(previewQuestion ? previewState : previewResultsState);
  byId("status").textContent = `Styling preview — ${previewQuestion ? "this question" : "results"} stays open`;
} else {
  refresh();
  setInterval(refresh, 400);
  addEventListener("pagehide", () => {
    navigator.sendBeacon?.(`${API}/api/host-leave`, JSON.stringify({ host_id: hostId }));
  });
}
