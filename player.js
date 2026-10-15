const API = location.origin;
const TOKEN_KEY = "quiz-player-token";
const byId = (id) => document.getElementById(id);
const previewQuestion = new URLSearchParams(location.search).get("preview") === "question";
let token = previewQuestion ? "style-preview" : localStorage.getItem(TOKEN_KEY);
let refreshing = false;
let lastQuestion = 0;
const previewState = {
  phase: "question", question_number: 1, question_count: 3,
  remaining_ms: 14000, score: 200, answered: false,
  question: {
    prompt: "Which planet is known as the Red Planet?",
    choices: ["Venus", "Mars", "Jupiter", "Mercury"],
  },
};

async function request(path, data) {
  const response = await fetch(`${API}${path}`, data === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed");
  return result;
}

function showSection(id) {
  for (const section of ["join-section", "waiting-section", "question-section", "reveal-section", "results-section"]) {
    byId(section).hidden = section !== id;
  }
}

function fillScores(scores) {
  byId("top-five").replaceChildren();
  for (const entry of scores) {
    const li = document.createElement("li");
    li.textContent = `${entry.name} — ${entry.score} points`;
    byId("top-five").append(li);
  }
}

function render(state) {
  if (token && state.score === null) {
    token = null;
    localStorage.removeItem(TOKEN_KEY);
  }
  if (!token) {
    showSection("join-section");
    byId("status").textContent = state.phase === "lobby" ? "Enter your name to join" :
      state.end_reason === "host_left" ? "Host left. Game ended." : "This game has already started";
    byId("join-form").querySelector("button").disabled = state.phase !== "lobby";
    return;
  }

  byId("status").textContent = state.phase === "finished" ?
    (state.end_reason === "host_left" ? "Host left. Game ended." : "Game complete") : "Connected";
  if (state.phase === "lobby") {
    showSection("waiting-section");
    byId("player-count").textContent = state.player_count;
  } else if (state.phase === "question") {
    showSection("question-section");
    byId("question-number").textContent = state.question_number;
    byId("question-count").textContent = state.question_count;
    byId("timer").textContent = `${Math.ceil(state.remaining_ms / 1000)} seconds`;
    byId("question-prompt").textContent = state.question.prompt;
    byId("score").textContent = state.score;
    if (lastQuestion !== state.question_number) {
      byId("answer-options").replaceChildren();
      state.question.choices.forEach((choice, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = choice;
        button.classList.add("possible_answer")
        button.addEventListener("click", () => submitAnswer(index));
        byId("answer-options").append(button);
      });
      lastQuestion = state.question_number;
    }
    for (const button of byId("answer-options").querySelectorAll("button")) button.disabled = state.answered;
    byId("answer-status").textContent = state.answered ? "Answer submitted" : "Choose an answer";
  } else if (state.phase === "reveal") {
    showSection("reveal-section");
    byId("correct-answer").textContent = `Correct answer: ${state.question.choices[state.correct_answer]}`;
    byId("reveal-score").textContent = state.score;
  } else if (state.phase === "finished") {
    showSection("results-section");
    byId("winner").textContent = state.end_reason === "host_left" ?
      "Game ended early because the host left." : state.winners.join(", ");
    byId("final-score").textContent = state.score;
    fillScores(state.top_five);
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    render(await request(`/api/state${query}`));
  } catch (error) {
    byId("status").textContent = `Connection lost: ${error.message}`;
  } finally {
    refreshing = false;
  }
}

async function submitAnswer(choice) {
  if (previewQuestion) {
    previewState.answered = true;
    render(previewState);
    byId("answer-options").children[choice].classList.add("selected");
    byId("answer-status").textContent = "Answer submitted (preview)";
    return;
  }
  for (const button of byId("answer-options").querySelectorAll("button")) button.disabled = true;
  try {
    await request("/api/answer", { token, choice });
    await refresh();
  } catch (error) {
    byId("answer-status").textContent = error.message;
    await refresh();
  }
}

byId("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await request("/api/join", { name: byId("player-name").value });
    token = result.token;
    localStorage.setItem(TOKEN_KEY, token);
    await refresh();
  } catch (error) {
    byId("status").textContent = error.message;
  }
});

if (previewQuestion) {
  render(previewState);
  byId("status").textContent = "Styling preview — this question stays open";
} else {
  refresh();
  setInterval(refresh, 400);
}
