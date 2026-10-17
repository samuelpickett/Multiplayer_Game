# Local Multiplayer Quiz Show

A local quiz game for one host and multiple players on the same network. The host displays a QR code that players scan to join from their phones. Each question allows up to 20 seconds for answers and closes early when everyone has answered. Correct answers earn 100 points. At the end, the host sees the winner or tied winners and the top five scores, while each player sees their own placement and score.

## Instructions for Build and Use

Steps to build and/or run the software:

1. Install Python 3.11, Visual Studio Code, and the Live Server extension. The QR code library is included in `vendor/`, so no separate Python package installation is needed. There is no build step.
2. Open this project folder in VS Code. If you moved the folder, update `liveServer.settings.AdvanceCustomBrowserCmdLine` in `.vscode/settings.json` to point to its new `launch-game.cmd` path.
3. Open `index.html` and click **Go Live**. This starts the Python server on port 8000 and opens the host page. Alternatively, run `python server.py` and open `http://127.0.0.1:8000/` on the host computer.

Instructions for using the software:

1. Connect the host computer and players' phones to the same local network. Players scan the QR code on the host page or enter the join address shown below it, then choose a name.
2. After at least one player joins, the host clicks **Start game**. Players answer each question on their phones before its 20-second timer ends. The question closes sooner if everyone answers.
3. View the results after the last question. The host sees the top five and winner or tied winners; players see their own placement and score. The host can click **New game** to return to the lobby.

To change the quiz, edit `questions.json` and restart the Python server. Each question's `answer` is a zero-based index into its `choices` list. Stopping Live Server does not stop an already running Python server; stop that process before clicking **Go Live** again. Scores are kept in memory while the server runs.

## Development Environment

To recreate the development environment, you need the following software and/or libraries with the specified versions:

* Python 3.11.9 for the server, using its standard library `http.server` module.
* Visual Studio Code 1.142.0 with the Live Server extension 5.7.10 for the **Go Live** workflow.
* `qrcode` 8.2, already included in `vendor/`, to generate the join QR code.
* A modern web browser for the HTML, CSS, and JavaScript host and player pages. The included `launch-game.cmd` launcher is for Windows.

## Useful Websites to Learn More

I found these websites useful in developing this software:

* [Python 3.11 `http.server` documentation](https://docs.python.org/3.11/library/http.server.html)
* [MDN: Using the Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
* [Live Server for Visual Studio Code](https://marketplace.visualstudio.com/items/?itemName=ritwickdey.LiveServer)

## Future Work

The following items I plan to fix, improve, and/or add to this project in the future:

* [ ] Save game results so scores remain available after the Python server stops.
* [ ] Add a host interface for creating and editing questions instead of changing `questions.json` by hand.
