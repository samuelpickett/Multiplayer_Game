# Local multiplayer quiz show

Open this folder in VS Code. With the **Live Server** extension installed, open `index.html` and click **Go Live**. The workspace setting makes that button start the Python game server, then open the host page. Players scan the QR code on the host page or type the address printed below it. Phones and the host computer must be on the same local network.

The host sees the lobby and clicks **Start game** after at least one player joins. Each question lasts at most 20 seconds; it closes earlier if every player answers. A correct answer earns 100 points. The top five and any players tied for first are shown at the end. A player who reloads or briefly disconnects keeps their identity and score on that device while the Python server stays running.

Edit `questions.json` to change the quiz, then restart the Python server. Each `answer` is a zero-based index into `choices`. Edit `index.html`, `player.html`, and `styles.css` for the frontend. The HTML contains only the elements required by the game and the CSS only supplies basic layout.

The QR code and join address use the computer's detected local IP. If the wrong network adapter is selected, set `QUIZ_HOST_IP` to the correct address before starting the server. Windows Firewall may ask for permission to let Python accept local network connections. The Python server listens on port 8000. This setup is for one game on a trusted local network.

The Go Live launch setting contains this folder's full path. If you move the project, update `liveServer.settings.AdvanceCustomBrowserCmdLine` in `.vscode/settings.json`. Go Live starts the Python server if needed; stopping Live Server does not stop an already running game. To restart the Python server after editing questions, stop that process and click Go Live again.

For CSS work, open `player.html?preview=question` or `index.html?preview=question` through Live Server. These URLs hold a sample question on screen indefinitely and do not join or change the real game. Remove `?preview=question` to return to normal play.

The host page checks in with the Python server while it is open. If it closes, the game ends and players see an early-end message with the scores earned so far. A page refresh has a short grace period; a lost connection also ends the game after the host stops checking in. Restart the Python server once after updating this server code so the new behavior takes effect.

To run without Live Server, use `python server.py` and open `http://127.0.0.1:8000/` on the host computer.

## Visual templates

Open `templates/index.html` to compare four standalone visual directions. Each includes a host lobby, player join page, live quiz views, and final results. They are static previews and do not change the running game's frontend.
