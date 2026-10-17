"""Local multiplayer quiz server. Run with `python server.py`."""

import json
import os
import secrets
import socket
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))
import qrcode  # noqa: E402
from qrcode.image.svg import SvgPathImage  # noqa: E402

PORT = 8000
QUESTION_SECONDS = 20
REVEAL_SECONDS = 4
POINTS_PER_ANSWER = 100
HOST_LEAVE_GRACE_SECONDS = 4
HOST_STALE_SECONDS = 10


def load_questions():
    data = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
    if not isinstance(data, list) or not data:
        raise ValueError("questions.json must contain at least one question")
    for number, question in enumerate(data, 1):
        choices = question.get("choices")
        answer = question.get("answer")
        if not isinstance(question.get("prompt"), str) or not question["prompt"].strip():
            raise ValueError(f"Question {number} needs a prompt")
        if not isinstance(choices, list) or len(choices) < 2 or not all(
            isinstance(choice, str) and choice.strip() for choice in choices
        ):
            raise ValueError(f"Question {number} needs at least two choices")
        if type(answer) is not int or not 0 <= answer < len(choices):
            raise ValueError(f"Question {number} has an invalid answer index")
    return data


def local_ip():
    override = os.environ.get("QUIZ_HOST_IP")
    if override:
        return override
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # No packet is sent; this asks the OS which interface it would use.
            probe.connect(("192.0.2.1", 80))
            address = probe.getsockname()[0]
            if not address.startswith("127.") and not address.startswith("169.254."):
                return address
    except OSError:
        pass
    try:
        addresses = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
        for entry in addresses:
            address = entry[4][0]
            if not address.startswith("127.") and not address.startswith("169.254."):
                return address
    except OSError:
        pass
    return "127.0.0.1"


QUESTIONS = load_questions()
JOIN_URL = f"http://{local_ip()}:{PORT}/player.html"
LOCK = threading.RLock()
PLAYERS = {}  # reconnect token -> player record
HOSTS = {}  # host page id -> last contact and whether it is closing
GAME = {
    "phase": "lobby", "index": -1, "deadline": 0.0, "reveal_until": 0.0,
    "host_seen": False, "ever_started": False, "end_reason": None,
}


def leaderboard():
    ordered = sorted(PLAYERS.values(), key=lambda player: (-player["score"], player["joined"]))
    return [{"name": player["name"], "score": player["score"]} for player in ordered]


def advance_game():
    now = time.monotonic()
    for host_id, host in list(HOSTS.items()):
        timeout = HOST_LEAVE_GRACE_SECONDS if host["leaving"] else HOST_STALE_SECONDS
        if now - host["seen"] >= timeout:
            del HOSTS[host_id]
    if GAME["host_seen"] and not HOSTS and GAME["phase"] != "finished":
        GAME["phase"] = "finished"
        GAME["end_reason"] = "host_left"
        return
    if GAME["phase"] == "question":
        everyone_answered = bool(PLAYERS) and all(
            GAME["index"] in player["answers"] for player in PLAYERS.values()
        )
        if now >= GAME["deadline"] or everyone_answered:
            correct = QUESTIONS[GAME["index"]]["answer"]
            for player in PLAYERS.values():
                if player["answers"].get(GAME["index"]) == correct:
                    player["score"] += POINTS_PER_ANSWER
            GAME["phase"] = "reveal"
            GAME["reveal_until"] = now + REVEAL_SECONDS
    if GAME["phase"] == "reveal" and now >= GAME["reveal_until"]:
        if GAME["index"] + 1 == len(QUESTIONS):
            GAME["phase"] = "finished"
            GAME["end_reason"] = "completed"
        else:
            GAME["index"] += 1
            GAME["phase"] = "question"
            GAME["deadline"] = now + QUESTION_SECONDS


def public_state(player_token=None, host=False):
    advance_game()
    phase = GAME["phase"]
    player = PLAYERS.get(player_token)
    state = {
        "phase": phase,
        "player_count": len(PLAYERS),
        "players": [item["name"] for item in PLAYERS.values()],
        "question_number": GAME["index"] + 1 if GAME["index"] >= 0 else 0,
        "question_count": len(QUESTIONS),
        "remaining_ms": max(0, int((GAME["deadline"] - time.monotonic()) * 1000))
        if phase == "question" else 0,
        "join_url": JOIN_URL if host else None,
        "score": player["score"] if player else None,
        "answered": GAME["index"] in player["answers"] if player and GAME["index"] >= 0 else False,
        "end_reason": GAME["end_reason"] if phase == "finished" else None,
    }
    if phase in ("question", "reveal"):
        question = QUESTIONS[GAME["index"]]
        state["question"] = {"prompt": question["prompt"], "choices": question["choices"]}
        state["answer_count"] = sum(
            GAME["index"] in item["answers"] for item in PLAYERS.values()
        )
        if phase == "reveal":
            state["correct_answer"] = question["answer"]
    if phase == "finished":
        scores = leaderboard()
        if host:
            state["top_five"] = scores[:5] if GAME["ever_started"] else []
            state["winners"] = (
                [item["name"] for item in scores if item["score"] == scores[0]["score"]]
                if scores and GAME["end_reason"] == "completed" else []
            )
        elif player and GAME["ever_started"]:
            state["placement"] = 1 + sum(
                entry["score"] > player["score"] for entry in PLAYERS.values()
            )
            state["placement_tied"] = sum(
                entry["score"] == player["score"] for entry in PLAYERS.values()
            ) > 1
    return state


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format_string, *args):
        print(f"{self.address_string()} - {format_string % args}")

    def headers_for_response(self, content_type, length):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in ("http://127.0.0.1:5500", "http://localhost:5500"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in ("http://127.0.0.1:5500", "http://localhost:5500"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        origin = self.headers.get("Origin")
        if origin in ("http://127.0.0.1:5500", "http://localhost:5500"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self.send_json({"ok": True, "app": "local-quiz"})
            return
        if path == "/api/state":
            query = parse_qs(parsed.query)
            token = query.get("token", [None])[0]
            host = self.client_address[0] in ("127.0.0.1", "::1") and query.get("host") == ["1"]
            with LOCK:
                advance_game()
                if host:
                    host_id = query.get("host_id", ["legacy"])[0][:128]
                    if host_id:
                        HOSTS[host_id] = {"seen": time.monotonic(), "leaving": False}
                        GAME["host_seen"] = True
                self.send_json(public_state(token, host))
            return
        if path == "/api/qr.svg":
            image = qrcode.make(JOIN_URL, image_factory=SvgPathImage, box_size=8, border=2)
            body = image.to_string()
            self.headers_for_response("image/svg+xml", len(body))
            self.wfile.write(body)
            return
        files = {
            "/": "index.html", "/index.html": "index.html", "/player.html": "player.html",
            "/styles.css": "styles.css", "/host.js": "host.js", "/player.js": "player.js",
        }
        name = files.get(path)
        if not name:
            self.send_error(404)
            return
        body = (ROOT / name).read_bytes()
        content_type = "text/html; charset=utf-8" if name.endswith(".html") else (
            "text/css; charset=utf-8" if name.endswith(".css") else "text/javascript; charset=utf-8"
        )
        self.headers_for_response(content_type, len(body))
        self.wfile.write(body)

    def do_POST(self):
        if not self.path.startswith("/api/"):
            self.send_json({"error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                raise ValueError("Request too large")
            data = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(data, dict):
                raise ValueError("Expected a JSON object")
        except (ValueError, json.JSONDecodeError):
            self.send_json({"error": "Invalid request"}, 400)
            return
        with LOCK:
            advance_game()
            if self.path == "/api/host-leave":
                if self.client_address[0] not in ("127.0.0.1", "::1"):
                    self.send_json({"error": "Host controls are available on the host computer only"}, 403)
                    return
                host_id = data.get("host_id")
                if isinstance(host_id, str) and host_id in HOSTS:
                    HOSTS[host_id] = {"seen": time.monotonic(), "leaving": True}
                self.send_json({"ok": True})
                return
            if self.path == "/api/join":
                token = data.get("token")
                if isinstance(token, str) and token in PLAYERS:
                    self.send_json({"token": token, "name": PLAYERS[token]["name"]})
                    return
                if GAME["phase"] != "lobby":
                    self.send_json({"error": "This game has already started"}, 409)
                    return
                name = str(data.get("name", "")).strip()[:24]
                if not name:
                    self.send_json({"error": "Enter a name"}, 400)
                    return
                if any(item["name"].casefold() == name.casefold() for item in PLAYERS.values()):
                    self.send_json({"error": "That name is already in use"}, 409)
                    return
                token = secrets.token_urlsafe(24)
                PLAYERS[token] = {"name": name, "score": 0, "answers": {}, "joined": len(PLAYERS)}
                self.send_json({"token": token, "name": name})
                return
            if self.path in ("/api/start", "/api/reset"):
                if self.client_address[0] not in ("127.0.0.1", "::1"):
                    self.send_json({"error": "Host controls are available on the host computer only"}, 403)
                    return
                host_id = data.get("host_id", "legacy")
                if not isinstance(host_id, str) or not host_id or len(host_id) > 128:
                    self.send_json({"error": "Invalid host page"}, 400)
                    return
                HOSTS[host_id] = {"seen": time.monotonic(), "leaving": False}
                GAME["host_seen"] = True
                if self.path == "/api/reset":
                    PLAYERS.clear()
                    GAME.update(
                        phase="lobby", index=-1, deadline=0.0, reveal_until=0.0,
                        ever_started=False, end_reason=None,
                    )
                elif GAME["phase"] == "lobby" and PLAYERS:
                    GAME.update(
                        phase="question", index=0, deadline=time.monotonic() + QUESTION_SECONDS,
                        ever_started=True, end_reason=None,
                    )
                else:
                    self.send_json({"error": "The game cannot start yet"}, 409)
                    return
                self.send_json({"ok": True})
                return
            if self.path == "/api/answer":
                token, choice = data.get("token"), data.get("choice")
                if not isinstance(token, str) or token not in PLAYERS:
                    self.send_json({"error": "Join the game first"}, 403)
                    return
                if GAME["phase"] != "question":
                    self.send_json({"error": "Answers are closed"}, 409)
                    return
                player = PLAYERS[token]
                if GAME["index"] in player["answers"]:
                    self.send_json({"error": "You already answered"}, 409)
                    return
                if type(choice) is not int or not 0 <= choice < len(QUESTIONS[GAME["index"]]["choices"]):
                    self.send_json({"error": "Choose an answer"}, 400)
                    return
                player["answers"][GAME["index"]] = choice
                advance_game()
                self.send_json({"ok": True})
                return
        self.send_json({"error": "Not found"}, 404)


if __name__ == "__main__":
    print(f"Quiz server: http://127.0.0.1:{PORT}")
    print(f"Player join URL: {JOIN_URL}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
