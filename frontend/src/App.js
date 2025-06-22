import { useEffect, useState } from "react";
import "./App.css";
import io from "socket.io-client";
import Editor from "@monaco-editor/react";
import { v4 as uuid } from "uuid";

const socket = io("http://localhost:5000");

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomID, setRoomID] = useState("");
  const [userName, setUserName] = useState("");
  const [password, setPassword] = useState("");
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState("// start code here");
  const [copySuccess, setCopySuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [outPut, setOutPut] = useState("");
  const [version, setVersion] = useState("*");
  const [userInput, setUserInput] = useState("");
  const [chat, setChat] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [error, setError] = useState("");

  const languageVersionMap = {
    javascript: "18.15.0",
    python: "3.10.0",
    java: "15.0.2",
    cpp: "10.2.0",
  };

  useEffect(() => {
    socket.on("userJoined", (users) => setUsers(users));
    socket.on("codeUpdate", (newCode) => setCode(newCode));
    socket.on("userTyping", (user) => {
      setTyping(`${user.slice(0, 8)}... is Typing`);
      setTimeout(() => setTyping(""), 2000);
    });
    socket.on("languageUpdate", (newLanguage) => setLanguage(newLanguage));
    socket.on("codeResponse", (response) => setOutPut(response.run.output));
    socket.on("newChatMessage", ({ username, message }) =>
      setChatMessages((prev) => [...prev, { username, message }])
    );

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("userTyping");
      socket.off("languageUpdate");
      socket.off("codeResponse");
      socket.off("newChatMessage");
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => socket.emit("leaveRoom");
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const joinRoom = () => {
    if (roomID && userName && password) {
      socket.emit("join", { roomID, username: userName, password }, (response) => {
        if (response?.success) {
          setJoined(true);
          setError("");
        } else {
          setError(response?.error || "Failed to join room.");
        }
      });
    } else {
      setError("All fields are required.");
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomID("");
    setUserName("");
    setPassword("");
    setError("");
    setCode("// start code here");
    setLanguage("javascript");
    setChatMessages([]);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomID);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);
    socket.emit("codeChange", { roomID, code: newCode });
    socket.emit("typing", { roomID, username: userName });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    const newVersion = languageVersionMap[newLanguage];
    setVersion(newVersion);
    setLanguage(newLanguage);
    socket.emit("languageChange", { roomID, language: newLanguage });
  };

  const runCode = () => {
    socket.emit("compileCode", {
      code,
      roomID,
      language,
      version,
      input: userInput,
    });
  };

  const createRoomID = () => setRoomID(uuid());

  const sendChat = () => {
    if (chat.trim()) {
      socket.emit("chatMessage", { roomID, username: userName, message: chat });
      setChat("");
    }
  };

  const downloadCode = () => {
    const extensionMap = {
      javascript: "js",
      python: "py",
      java: "java",
      cpp: "cpp",
    };
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ext = extensionMap[language] || "txt";
    a.href = url;
    a.download = `code-snippet.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <h1>Join Code Room</h1>

          <input
            type="text"
            placeholder="Room ID"
            value={roomID}
            onChange={(e) => setRoomID(e.target.value)}
          />
          <button onClick={createRoomID}>Create ID</button>

          <input
            type="password"
            placeholder="Room Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <input
            type="text"
            placeholder="Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          <button onClick={joinRoom}>Join Room</button>

          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="sidebar">
        <div className="room-info">
          <h2>Room: {roomID}</h2>
          <button onClick={copyRoomId} className="copy-button">
            Copy ID
          </button>
          {copySuccess && <span className="copy-success">{copySuccess}</span>}
        </div>

        <h3>Users:</h3>
        <ul>{users.map((user, i) => <li key={i}>{user.slice(0, 8)}...</li>)}</ul>
        <p className="typing-indicator">{typing}</p>

        <select className="language-selector" value={language} onChange={handleLanguageChange}>
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>

        <button className="leave-button" onClick={leaveRoom}>
          Leave Room
        </button>
        <button onClick={downloadCode} className="save-button">
          Save Code
        </button>
      </div>

      <div className="editor-wrapper">
        <Editor
          height={"60%"}
          language={language}
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />

        <textarea
          className="input-console"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Enter input here..."
        />
        <button className="run-btn" onClick={runCode}>
          Execute
        </button>
        <textarea
          className="output-console"
          value={outPut}
          readOnly
          placeholder="Output will appear here ..."
        />

        <div className="chat-section">
          <h4>Chat</h4>
          <div className="chat-box">
            {chatMessages.map((msg, i) => (
              <p key={i}>
                <strong>{msg.username}:</strong> {msg.message}
              </p>
            ))}
          </div>
          <input
            className="chat-input"
            placeholder="Type a message..."
            value={chat}
            onChange={(e) => setChat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
