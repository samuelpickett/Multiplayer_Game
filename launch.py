"""Started by VS Code Live Server's custom browser command on Windows."""

import json
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HEALTH_URL = "http://127.0.0.1:8000/api/health"


def server_is_ready():
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=0.5) as response:
            data = json.load(response)
            return data.get("app") == "local-quiz"
    except (OSError, ValueError):
        return False


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Live Server URL is required")
    if not server_is_ready():
        subprocess.Popen(
            [sys.executable, str(ROOT / "server.py")],
            cwd=ROOT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(30):
            if server_is_ready():
                break
            time.sleep(0.1)
    if not server_is_ready():
        raise SystemExit("Python game server did not start. Run `python server.py` to see the error.")
    webbrowser.open(sys.argv[1])


if __name__ == "__main__":
    main()
