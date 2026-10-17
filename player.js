const API = location.origin;
const TOKEN_KEY = "quiz-player-token";
const byId = (id) => document.getElementById(id);
const previewMode = new URLSearchParams(location.search).get("preview");
const previewQuestion = previewMode === "question";
const previewResults = previewMode === "results";
let token = previewQuestion || previewResults ? "style-preview" : localStorage.getItem(TOKEN_KEY);
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
const previewResultsState = {
  phase: "finished", end_reason: "completed", score: 400,
  placement: 2, placement_tied: true, player_count: 6,
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

function ordinal(place) {
  if (place % 100 >= 11 && place % 100 <= 13) return `${place}th`;
  return `${place}${["th", "st", "nd", "rd"][place % 10] || "th"}`;
}

function playerPlacement(state) {
  if (state.placement != null) return { rank: state.placement, tied: state.placement_tied };

  // Older running servers still send the top five instead of a player's placement.
  // Their scores are enough to recover a rank when every higher score is in that list.
  const scores = state.top_five;
  if (!Array.isArray(scores) || !scores.length || state.score == null) return null;
  if (scores.length < state.player_count && state.score < scores[scores.length - 1].score) return null;
  return {
    rank: 1 + scores.filter((entry) => entry.score > state.score).length,
    tied: scores.filter((entry) => entry.score === state.score).length > 1,
  };
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
    const placement = playerPlacement(state);
    byId("placement").textContent = placement ?
      `${placement.tied ? "Tied for " : "You placed "}${ordinal(placement.rank)} of ${state.player_count}` :
      state.end_reason === "host_left" && state.question_number === 0 ?
        "Game ended before it started." : "Placement unavailable. Restart the Python server for the next game.";
    byId("final-score").textContent = state.score;
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

if (previewQuestion || previewResults) {
  render(previewQuestion ? previewState : previewResultsState);
  byId("status").textContent = `Styling preview — ${previewQuestion ? "this question" : "results"} stays open`;
} else {
  refresh();
  setInterval(refresh, 400);
}
